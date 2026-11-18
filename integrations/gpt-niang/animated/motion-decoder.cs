using System;
using System.IO;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Runtime.CompilerServices;
using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

// Workers only decode detached frozen pixels. No UI, network, credentials,
// executable content, or user documents are touched by this helper.
public static class DragonMotionDecoder {
    public static Task<BitmapSource> LoadAsync(string file, int cell, int rows) {
        return LoadAsync(file, cell, rows, null);
    }
    public static Task<BitmapSource> LoadAsync(string file, int cell, int rows, string expectedHash) {
        return LoadAsync(file, cell, rows, expectedHash, 1, 0, 0);
    }
    public static Task<BitmapSource> LoadAsync(string file, int cell, int rows, string expectedHash, double scale, double offsetX, double offsetY) {
        if ((cell != 320 && cell != 384) || rows < 1 || rows > 8)
            throw new ArgumentException("MOTION_LAYOUT");
        ValidatePresentation(scale, offsetX, offsetY);
        return Task.Run<BitmapSource>(() => {
            using (FileStream stream = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                if (stream.Length < 1 || stream.Length > 20 * 1024 * 1024)
                    throw new InvalidDataException("MOTION_FILE_SIZE");
                if (!String.IsNullOrEmpty(expectedHash)) {
                    using (SHA256 algorithm = SHA256.Create()) {
                        string actual = BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", "");
                        if (!String.Equals(actual, expectedHash, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("MOTION_FILE_HASH");
                    }
                    stream.Position = 0;
                }
                PngBitmapDecoder decoder = new PngBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnDemand);
                BitmapSource frame = decoder.Frames[0];
                int width = 8 * cell, height = rows * cell;
                if (frame.PixelWidth != width || frame.PixelHeight != height)
                    throw new InvalidDataException("MOTION_DIMENSIONS");
                FormatConvertedBitmap converted = new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0);
                int stride = width * 4;
                byte[] pixels = new byte[stride * height];
                converted.CopyPixels(pixels, stride, 0);
                pixels = CalibrateAtlas(pixels, cell, rows, scale, offsetX, offsetY);
                BitmapSource result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
                result.Freeze();
                return result;
            }
        });
    }
    static void ValidatePresentation(double scale, double offsetX, double offsetY) {
        if (Double.IsNaN(scale) || Double.IsInfinity(scale) || scale < 0.85 || scale > 1.18 ||
            Double.IsNaN(offsetX) || Double.IsInfinity(offsetX) || Math.Abs(offsetX) > 70 ||
            Double.IsNaN(offsetY) || Double.IsInfinity(offsetY) || Math.Abs(offsetY) > 70)
            throw new ArgumentException("MOTION_PRESENTATION");
    }
    // A single fixed affine camera for every cell in this clip. It is applied
    // once by the decode worker; originals, frame order and the UI transform
    // (including its independent click rebound) remain untouched.
    public static byte[] CalibrateAtlas(byte[] input, int cell, int rows, double scale, double offsetX, double offsetY) {
        ValidatePresentation(scale, offsetX, offsetY);
        if ((cell != 320 && cell != 384) || rows < 1 || rows > 8 || input == null || input.Length != cell * 8 * cell * rows * 4)
            throw new ArgumentException("MOTION_PRESENTATION_LAYOUT");
        if (scale == 1 && offsetX == 0 && offsetY == 0) return input;
        int stride = cell * 8 * 4;
        byte[] output = new byte[input.Length];
        int[] xs = new int[cell], ys = new int[cell];
        double[] wx = new double[cell], wy = new double[cell];
        for (int n = 0; n < cell; n++) {
            double x = (n + 0.5 - offsetX) / scale - 0.5, y = (n + 0.5 - offsetY) / scale - 0.5;
            xs[n] = (int)Math.Floor(x); ys[n] = (int)Math.Floor(y);
            wx[n] = x - xs[n]; wy[n] = y - ys[n];
        }
        for (int tile = 0; tile < rows * 8; tile++) {
            int baseX = (tile % 8) * cell, baseY = (tile / 8) * cell;
            int left = cell, right = -1, top = cell, bottom = -1;
            for (int y = 0; y < cell; y++) {
                int line = (baseY + y) * stride + baseX * 4;
                for (int x = 0; x < cell; x++) if (input[line + x * 4 + 3] != 0) {
                    if (x < left) left = x; if (x > right) right = x;
                    if (y < top) top = y; if (y > bottom) bottom = y;
                }
            }
            if (right < left) continue;
            int xFrom = Math.Max(0, (int)Math.Floor(left * scale + offsetX - 1));
            int xTo = Math.Min(cell - 1, (int)Math.Ceiling((right + 1) * scale + offsetX + 1));
            int yFrom = Math.Max(0, (int)Math.Floor(top * scale + offsetY - 1));
            int yTo = Math.Min(cell - 1, (int)Math.Ceiling((bottom + 1) * scale + offsetY + 1));
            for (int y = yFrom; y <= yTo; y++) for (int x = xFrom; x <= xTo; x++) {
                double a = 0, b = 0, g = 0, r = 0;
                for (int dy = 0; dy < 2; dy++) {
                    int sy = ys[y] + dy; if (sy < 0 || sy >= cell) continue;
                    double weightY = dy == 0 ? 1 - wy[y] : wy[y];
                    int line = (baseY + sy) * stride + baseX * 4;
                    for (int dx = 0; dx < 2; dx++) {
                        int sx = xs[x] + dx; if (sx < 0 || sx >= cell) continue;
                        int at = line + sx * 4;
                        double alpha = input[at + 3] * weightY * (dx == 0 ? 1 - wx[x] : wx[x]);
                        a += alpha; b += input[at] * alpha; g += input[at + 1] * alpha; r += input[at + 2] * alpha;
                    }
                }
                if (a <= 0) continue;
                int target = (baseY + y) * stride + (baseX + x) * 4;
                output[target] = (byte)Math.Min(255, Math.Round(b / a));
                output[target + 1] = (byte)Math.Min(255, Math.Round(g / a));
                output[target + 2] = (byte)Math.Min(255, Math.Round(r / a));
                output[target + 3] = (byte)Math.Min(255, Math.Round(a));
            }
        }
        return output;
    }
    static readonly ConditionalWeakTable<BitmapSource, BitmapSource[]> frameCache = new ConditionalWeakTable<BitmapSource, BitmapSource[]>();
    public static BitmapSource Crop(BitmapSource atlas, int cell, int index) {
        BitmapSource[] frames = frameCache.GetValue(atlas, key => new BitmapSource[64]);
        lock (frames) {
            if (frames[index] == null) {
                CroppedBitmap frame = new CroppedBitmap(atlas, new Int32Rect((index % 8) * cell, (index / 8) * cell, cell, cell));
                frame.Freeze(); frames[index] = frame;
            }
            return frames[index];
        }
    }
    public static BitmapSource Detach(BitmapSource source) {
        int width = source.PixelWidth, height = source.PixelHeight, stride = width * 4;
        byte[] pixels = new byte[stride * height];
        source.CopyPixels(pixels, stride, 0);
        BitmapSource result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
        result.Freeze();
        return result;
    }
    static readonly object blendLock = new object();
    static WeakReference blendPrevious = new WeakReference(null), blendCurrent = new WeakReference(null);
    static byte[] previousPixels, currentPixels, blendedPixels;
    static byte[] BlendPixels(BitmapSource source, WeakReference cached, ref byte[] pixels) {
        int stride=source.PixelWidth*4, length=stride*source.PixelHeight;
        if(pixels==null||pixels.Length!=length)pixels=new byte[length];
        if(!source.IsFrozen||!Object.ReferenceEquals(cached.Target,source)){
            source.CopyPixels(pixels,stride,0);cached.Target=source;
        }
        return pixels;
    }
    public static BitmapSource Blend(BitmapSource previous, BitmapSource current, double progress) {
        progress = Math.Max(0, Math.Min(1, progress));
        int width = current.PixelWidth, height = current.PixelHeight, stride = width * 4;
        if (previous.PixelWidth != width || previous.PixelHeight != height) return current;
        // A transition reuses the same old pose and often the same 24/30fps
        // current frame. Do not re-read and allocate both images on every UI tick.
        lock(blendLock) {
        byte[] a=BlendPixels(previous,blendPrevious,ref previousPixels);
        byte[] b=BlendPixels(current,blendCurrent,ref currentPixels);
        // BitmapSource.Create copies the supplied buffer. Reuse only this
        // bounded scratch array; never mutate a previously returned bitmap.
        if(blendedPixels==null||blendedPixels.Length!=stride*height)blendedPixels=new byte[stride*height];
        byte[] output=blendedPixels;Array.Clear(output,0,output.Length);
        double inverse=1-progress;
        for (int i = 0; i < output.Length; i += 4) {
            int aa=a[i+3],ba=b[i+3];
            if((aa|ba)==0)continue;
            // Most visible pixels have equal (usually fully opaque) alpha.
            // In that case alpha cancels from the straight-color calculation.
            if(aa==ba){
                output[i]=(byte)Math.Round(a[i]*inverse+b[i]*progress);
                output[i+1]=(byte)Math.Round(a[i+1]*inverse+b[i+1]*progress);
                output[i+2]=(byte)Math.Round(a[i+2]*inverse+b[i+2]*progress);
                output[i+3]=(byte)aa;continue;
            }
            double oldAlpha = aa * inverse, newAlpha = ba * progress;
            double alpha = oldAlpha + newAlpha;
            if (alpha > 0) {
                for (int channel = 0; channel < 3; channel++)
                    output[i + channel] = (byte)Math.Round((a[i + channel] * oldAlpha + b[i + channel] * newAlpha) / alpha);
                output[i + 3] = (byte)Math.Round(alpha);
            }
        }
        BitmapSource result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, output, stride);
        result.Freeze();
        return result;
        }
    }
}

// Legacy UTC fields remain compatible with forms/tests, while elapsed media
// time is monotonic until that field is explicitly reset by its owner.
public sealed class DragonMediaClock {
    long stamp = Int64.MinValue, ticks;
    double initialAge;
    bool suspended;
    public double Age(long utcNow, long mediaStamp) {
        long now = Stopwatch.GetTimestamp();
        if (mediaStamp != stamp) {
            stamp = mediaStamp; ticks = now; initialAge = Math.Max(0, utcNow - mediaStamp); suspended = false;
        }
        return initialAge + (suspended ? 0 : Math.Max(0, (now - ticks) * 1000.0 / Stopwatch.Frequency));
    }
    public void Suspend(long utcNow, long mediaStamp) { initialAge = Age(utcNow, mediaStamp); suspended = true; }
    public void Resume(long previousStamp, long mediaStamp) {
        // An explicit clip change during a pause still belongs to its caller.
        if (!suspended || stamp != previousStamp) return;
        stamp = mediaStamp; ticks = Stopwatch.GetTimestamp(); suspended = false;
    }
}

// Forms keep writing their public UTC deadline. Capture each new value once,
// then measure its remaining local duration with Stopwatch.
public sealed class DragonDeadlineClock {
    long stamp = Int64.MinValue, ticks;
    double remaining;
    bool suspended;
    public double Remaining(long utcNow, long utcDeadline) {
        long now = Stopwatch.GetTimestamp();
        if (stamp != utcDeadline) {
            stamp = utcDeadline; ticks = now; remaining = Math.Max(0, utcDeadline - utcNow); suspended = false;
        }
        return Math.Max(0, remaining - (suspended ? 0 : Math.Max(0, (now - ticks) * 1000.0 / Stopwatch.Frequency)));
    }
    public void Suspend(long utcNow, long utcDeadline) { remaining = Remaining(utcNow, utcDeadline); suspended = true; }
    public void Resume(long previousDeadline, long utcDeadline) {
        if (!suspended || stamp != previousDeadline) return;
        stamp = utcDeadline; ticks = Stopwatch.GetTimestamp(); suspended = false;
    }
}
