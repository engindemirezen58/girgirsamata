// Client-side GIF generator
let gifWorkerUrl = null;

// Preload the gif.worker.js to bypass CORS issues for Web Workers
fetch('https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js')
  .then(res => res.text())
  .then(text => {
    const blob = new Blob([text], { type: 'application/javascript' });
    gifWorkerUrl = URL.createObjectURL(blob);
    console.log('GIF worker loaded.');
  });

async function downloadMeme(imgSrc, caption, style, caption2, style2, filename, caption3, style3) {
  const isVideo = /\.(mp4|webm|mov)$/i.test(imgSrc);
  if (isVideo) {
    if(typeof toast === 'function') toast(window.myLang === 'tr' ? 'Video hazırlanıyor, lütfen bekleyin...' : 'Preparing video, please wait...', 5000);
    
    // Sunucudaki yeni endpoint'e istek atıyoruz
    fetch('/api/download-video-meme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: imgSrc, caption, style, caption2, style2, caption3, style3 })
    })
    .then(response => {
      if (!response.ok) throw new Error('Render hatası');
      return response.blob();
    })
    .then(blob => {
      // Gelen MP4 dosyasını tarayıcıda indiriyoruz
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ? filename.replace(/\.(png|gif)$/i, '.mp4') : 'meme.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(err => {
      console.error(err);
      if(typeof toast === 'function') toast(window.myLang === 'tr' ? 'İndirme sırasında bir hata oluştu.' : 'An error occurred during download.', 3000);
    });
    return;
  }

  const isGif = /\.gif$/i.test(imgSrc);
  if (!isGif) {
    // Standard static image download via hidden canvas
    fetch(imgSrc)
      .then(res => res.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const canvas = document.createElement('canvas');
        drawMeme(canvas, objUrl, caption, () => {
          canvas.toBlob(outBlob => {
            const dlUrl = window.URL.createObjectURL(outBlob);
            const link = document.createElement('a');
            link.download = filename || 'meme.png';
            link.href = dlUrl;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(dlUrl);
            window.URL.revokeObjectURL(objUrl);
          }, 'image/png');
        }, 800, 600, style, caption2, style2, caption3, style3);
      })
      .catch(err => {
        console.error("Static image download error:", err);
        if(typeof toast === 'function') toast(window.myLang === 'tr' ? 'İndirme sırasında bir hata oluştu.' : 'An error occurred during download.', 3000);
      });
    return;
  }

  // Animated GIF generation
  try {
    toast(t('toastGifPreparing'), 5000);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    
    // 1. Fetch the GIF
    const response = await fetch(imgSrc);
    const buffer = await response.arrayBuffer();
    
    // 2. Decode the GIF frames
    const parsedGif = window.parseGIF(buffer);
    const frames = window.decompressFrames(parsedGif, true);
    
    if (!frames.length) throw new Error('No frames found in GIF');
    
    const width = frames[0].dims.width;
    const height = frames[0].dims.height;
    
    // 3. Setup GIF.js encoder
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: width,
      height: height,
      workerScript: gifWorkerUrl
    });
    
    // Temporary canvas to process frames
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // 4. Process each frame
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const dims = frame.dims;
      
      if (frame.disposalType === 2) {
        tempCtx.clearRect(0, 0, width, height);
      }
      
      const patchData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        dims.width,
        dims.height
      );
      
      tempCtx.putImageData(patchData, dims.left, dims.top);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(tempCanvas, 0, 0);
      
      // Draw Caption
      if (caption && caption.trim()) {
        if (style) {
          renderCustomCaption(ctx, width, height, caption, style);
        } else {
          renderCaption(ctx, width, height, caption);
        }
      }

      // Draw Second Caption
      if (caption2 && caption2.trim()) {
        if (style2) {
          renderCustomCaption(ctx, width, height, caption2, style2);
        } else {
          renderCaption(ctx, width, height, caption2);
        }
      }

      // Draw Third Caption
      if (caption3 && caption3.trim()) {
        if (style3) {
          renderCustomCaption(ctx, width, height, caption3, style3);
        } else {
          renderCaption(ctx, width, height, caption3);
        }
      }
      
      gif.addFrame(ctx, { copy: true, delay: frame.delay });
    }
    
    // 5. Render and Download
    gif.on('finished', function(blob) {
      const link = document.createElement('a');
      link.download = filename || 'meme.gif';
      link.href = URL.createObjectURL(blob);
      link.click();
      toast(t('toastGifDownloaded'), 2000);
    });
    
    gif.render();
  } catch (err) {
    console.error(err);
    toast(t('toastGifError'), 3000);
  }
}
