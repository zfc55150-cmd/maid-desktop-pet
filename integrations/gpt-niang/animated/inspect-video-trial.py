"""Measure and preview a generated trial. Reports do not replace visual review.

Only chroma-key extraction, alpha math, frame sampling and layout are applied;
this script never draws or modifies the character design.
"""
from pathlib import Path
import argparse,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'work'/'gpt-niang-animation'
sys.path[:0]=[str(WORK/'motion-tools'),str(WORK/'video-tools')]
import cv2,numpy as np
try:
    import imageio_ffmpeg
except ImportError:
    imageio_ffmpeg=None
from PIL import Image,ImageDraw

def key_frame(rgb, preserve_detached=False):
    p=np.asarray(rgb).astype(np.float32)/255
    green=np.maximum(0,p[:,:,1]-np.maximum(p[:,:,0],p[:,:,2]))
    background=np.array([0,1,0],dtype=np.float32)
    adaptive_alpha=None
    colour_alpha=None
    # Some generated clips desaturate the green screen. Estimate only the
    # empty outer border's colour plane; no learned model or subject repaint.
    # Near-perfect green retains the simple key. Non-ideal green, grey-green
    # and blue-grey use the measured plane, avoiding opaque compression blocks.
    h,w=p.shape[:2]
    if min(h,w)>=32:
        band=max(2,min(h,w)//40);yy,xx=np.mgrid[:h,:w]
        border=((xx<band)|(xx>=w-band)|(yy<band)|(yy>=h-band))&((xx%4==0)&(yy%4==0))
        samples=p[border];median=np.median(samples,axis=0)
        if float(np.max(np.abs(median-background)))>.06:
            x=xx.astype(np.float32)/max(1,w-1)*2-1;y=yy.astype(np.float32)/max(1,h-1)*2-1
            basis=np.stack([np.ones_like(x),x,y],axis=2)
            fit=np.linalg.lstsq(basis[border],samples,rcond=None)[0]
            residual=np.max(np.abs(basis[border]@fit-samples),axis=1)
            if float(np.quantile(residual,.95))<.035:
                background=np.clip(basis@fit,0,1)
                # This fixed character uses white, lavender and warm skin:
                # green-minus-red distinguishes the screen even when its
                # blue channel exceeds green. Neon islands also key out.
                screen=np.maximum(.025,background[:,:,1]-background[:,:,0])
                adaptive_alpha=np.clip(1-np.maximum(0,p[:,:,1]-p[:,:,0])/screen,0,1)
                colour_alpha=adaptive_alpha.copy()
                core=cv2.erode(np.uint8(adaptive_alpha>.5),np.ones((3,3),np.uint8))>0
                adaptive_alpha[core]=1
    # The supplied reference contains no green artwork. Estimate the matte
    # against pure green, suppress compression noise, and remove key spill.
    alpha=adaptive_alpha if adaptive_alpha is not None else np.clip((1-green-.035)/.965,0,1)
    if np.ndim(background)>1:alpha[np.max(np.abs(p-background),axis=2)<.02]=0
    count,labels,stats,_=cv2.connectedComponentsWithStats(np.uint8(alpha>.5),connectivity=8)
    if count>1:
        main=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
        # Remove distant low-alpha background noise while keeping the full
        # connected figure and a narrow antialiasing margin around its edge.
        if preserve_detached:
            # Prop scenes contain intentional disconnected foreground (stars,
            # butterflies, paper cranes). Keep substantial components as well
            # as the figure, while still rejecting isolated compression noise.
            minimum=max(4,int(h*w*.000015))
            retained=np.zeros(count,dtype=bool)
            retained[1:]=stats[1:,cv2.CC_STAT_AREA]>=minimum
            mask=retained[labels]
        else:
            mask=labels==main
        alpha*=cv2.dilate(np.uint8(mask),np.ones((3,3),np.uint8))
    else:alpha[:]=0
    alpha[alpha<.05]=0
    unmix_alpha=alpha if colour_alpha is None else colour_alpha
    colour=p-background*(1-unmix_alpha[:,:,None])
    colour=np.divide(colour,unmix_alpha[:,:,None],out=np.zeros_like(colour),where=unmix_alpha[:,:,None]>.001)
    # Compression near the green boundary can turn unpremultiplication into
    # orange/red specks. Estimate those edge colours from the nearest solid
    # figure pixel; retain already balanced white/grey antialiasing colours.
    solid=alpha>.98
    if np.any(solid):
        _,nearest=cv2.distanceTransformWithLabels(np.uint8(~solid),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
        palette=np.zeros((int(nearest.max())+1,3),np.float32);palette[nearest[solid]]=colour[solid]
        edge=(alpha>0)&(alpha<.98)&(np.ptp(colour,axis=2)>.1)
        colour[edge]=palette[nearest[edge]]
    colour[alpha==0]=0
    return np.uint8(np.clip(np.dstack([colour,alpha])*255,0,255))

def inspect(directory):
    video=directory/'trial.mp4'
    reader=imageio_ffmpeg.read_frames(str(video),pix_fmt='rgb24')
    meta=next(reader);width,height=meta['size'];samples=[];bounds=[];areas=[];motion=[];previous=None;first=None;last=None;count=0
    for data in reader:
        rgb=np.frombuffer(data,np.uint8).reshape(height,width,3)
        rgba=key_frame(rgb);alpha=rgba[:,:,3]
        n,labels,stats,_=cv2.connectedComponentsWithStats(np.uint8(alpha>128),connectivity=8)
        if n<2:raise ValueError('NO_CHARACTER')
        main=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));x,y,w,h,area=[int(v) for v in stats[main]]
        bounds.append([x,y,x+w,y+h]);areas.append(area)
        premult=rgba.astype(np.float32);premult[:,:,:3]*=premult[:,:,3:]/255
        if previous is not None:motion.append(float(np.mean(np.abs(premult-previous))))
        if first is None:first=premult.copy()
        previous=premult;last=premult
        if count%12==0:
            frame=Image.fromarray(rgba);samples.append((count,frame));frame.save(directory/f'keyed-{count:03}.png')
        count+=1
    cols=5;tilew=300;tileh=230
    contact=Image.new('RGB',(cols*tilew,((len(samples)+cols-1)//cols)*tileh),'#292636');draw=ImageDraw.Draw(contact)
    for j,(index,frame) in enumerate(samples):
        frame.thumbnail((tilew,tileh-25),Image.Resampling.LANCZOS);x=j%cols*tilew+(tilew-frame.width)//2;y=j//cols*tileh
        contact.paste(frame,(x,y),frame);draw.text((j%cols*tilew+10,y+tileh-20),f'{index} / {meta["fps"]:.1f} fps',fill='#e4d8f3')
    contact.save(directory/'contact-keyed.png')
    result={'videoSha256':hashlib.sha256(video.read_bytes()).hexdigest(),'frames':count,'fps':meta['fps'],'size':[width,height],'bounds':bounds,'floorMin':min(x[3] for x in bounds),'floorMax':max(x[3] for x in bounds),'foregroundAreaRatioMaxToMin':max(areas)/max(1,min(areas)),'clippedFrames':sum(x[0]<2 or x[1]<2 or x[2]>width-2 or x[3]>height-2 for x in bounds),'meanFrameDifference':float(np.mean(motion)),'firstLastDifference':float(np.mean(np.abs(first-last))),'needsVisualReview':True,'productionApproved':False}
    (directory/'visual-metrics.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='bounds'}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory');inspect(Path(parser.parse_args().directory).resolve())
