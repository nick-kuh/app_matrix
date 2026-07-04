/* Chuva de código estilo Matrix — mesmo motor do telão, mais leve pra mobile */
(function () {
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789Z$#%&+*=<>';
  const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  let drops = [];
  const FONT = 16;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const cols = Math.ceil(canvas.width / FONT);
    drops = Array.from({ length: cols }, () => Math.floor(Math.random() * (canvas.height / FONT)));
  }
  resize();
  addEventListener('resize', resize);

  setInterval(() => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = FONT + "px 'Cascadia Code', monospace";
    for (let i = 0; i < drops.length; i++) {
      const x = i * FONT;
      const y = drops[i] * FONT;
      ctx.fillStyle = Math.random() < 0.06 ? '#c8ffdd' : '#00ff41';
      ctx.globalAlpha = 0.55;
      ctx.fillText(glyph(), x, y);
      ctx.globalAlpha = 1;
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      else drops[i]++;
    }
  }, 55);

  /* Tubarão ASCII vivo — o mesmo da tela do telão, mais compacto */
  const SHARK = [
'                                  ##',
'                                 #####',
'    ##                          #######',
'    ####                       #########',
'    ######                    ###########',
'     ########           ###########################',
'      ####################################################',
'     ############################################ O ############',
'    ############################################################',
'     #####################################################',
'      ###########################################    ######',
'    ####      ##############################    ########',
'    ###         #########      ##########         #####',
'     #           #######         ######             ##',
'                   ####            ###',
'                    ##',
  ];
  function sharkFrame() {
    return SHARK.map((row) =>
      row.replace(/[#O]/g, (c) => (c === 'O' ? '◉' : glyph()))
    ).join('\n');
  }
  const shark = document.getElementById('shark-ascii');
  if (shark) {
    shark.textContent = sharkFrame();
    setInterval(() => {
      if (shark.offsetParent !== null) shark.textContent = sharkFrame();
    }, 110);
  }
})();
