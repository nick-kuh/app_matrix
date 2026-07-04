// Matrix rain background canvas
(function () {
  const canvas = document.getElementById('matrix-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789$#@%'.split('');
  let width, height, columns, drops, fontSize;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontSize = width < 480 ? 14 : 16;
    columns = Math.floor(width / fontSize);
    drops = new Array(columns).fill(0).map(() => Math.random() * -50);
  }

  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = fontSize + "px 'Fira Code', monospace";

    for (let i = 0; i < drops.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      // brighter head
      if (Math.random() > 0.975) {
        ctx.fillStyle = '#c7ffdb';
      } else {
        ctx.fillStyle = '#00ff66';
      }
      ctx.fillText(ch, x, y);

      if (y > height && Math.random() > 0.965) {
        drops[i] = 0;
      }
      drops[i] += 1;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  let last = 0;
  function loop(t) {
    if (t - last > 55) {
      draw();
      last = t;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
