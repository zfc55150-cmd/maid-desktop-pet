using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

// Workers only decode detached frozen pixels. No UI, network, credentials,
// executable content, or user documents are touched by this helper.
public static class DragonMotionDecoder {
    public static Task<BitmapSource> LoadAsync(string file, int cell, int rows) {
        if ((cell != 320 && cell != 384) || rows < 1 || rows > 8)
            throw new ArgumentException("MOTION_LAYOUT");
        return Task.Run<BitmapSource>(() => {
            using (FileStream stream = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                if (stream.Length < 1 || stream.Length > 20 * 1024 * 1024)
                    throw new InvalidDataException("MOTION_FILE_SIZE");
                PngBitmapDecoder decoder = new PngBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnDemand);
                BitmapSource frame = decoder.Frames[0];
                int width = 8 * cell, height = rows * cell;
                if (frame.PixelWidth != width || frame.PixelHeight != height)
                    throw new InvalidDataException("MOTION_DIMENSIONS");
                FormatConvertedBitmap converted = new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0);
                int stride = width * 4;
                byte[] pixels = new byte[stride * height];
                converted.CopyPixels(pixels, stride, 0);
                BitmapSource result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
                result.Freeze();
                return result;
            }
        });
    }
    public static BitmapSource Detach(BitmapSource source) {
        int width = source.PixelWidth, height = source.PixelHeight, stride = width * 4;
        byte[] pixels = new byte[stride * height];
        source.CopyPixels(pixels, stride, 0);
        BitmapSource result = BitmapSource.Create(width, height, 96, 96, PixelFormats.Bgra32, null, pixels, stride);
        result.Freeze();
        return result;
    }
    public static BitmapSource Blend(BitmapSource previous, BitmapSource current, double progress) {
        progress = Math.Max(0, Math.Min(1, progress));
        int width = current.PixelWidth, height = current.PixelHeight, stride = width * 4;
        if (previous.PixelWidth != width || previous.PixelHeight != height) return current;
        byte[] a = new byte[stride * height], b = new byte[stride * height], output = new byte[stride * height];
        previous.CopyPixels(a, stride, 0); current.CopyPixels(b, stride, 0);
        for (int i = 0; i < output.Length; i += 4) {
            double oldAlpha = a[i + 3] * (1 - progress), newAlpha = b[i + 3] * progress;
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
