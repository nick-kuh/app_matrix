// Tubarão ASCII compartilhado entre telão e bank.
// Define SHARK_SHAPE (silhueta) e sharkFrame() (frame com glyphs Matrix aleatórios).
(function (root) {
  const SHARK_SHAPE = [
    "                                  ##",
    "                                 #####",
    "    ##                          #######",
    "    ####                       #########",
    "    ######                    ###########",
    "     ########           ###########################",
    "      ####################################################",
    "     ############################################ O ############",
    "    ############################################################",
    "     #####################################################",
    "      ###########################################    ######",
    "    ####      ##############################    ########",
    "    ###         #########      ##########         #####",
    "     #           #######         ######             ##",
    "                   ####            ###",
    "                    ##",
  ];

  const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789Z$#%&+*=<>";
  const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  function sharkFrame() {
    return SHARK_SHAPE.map((row) =>
      row.replace(/[#O]/g, (c) => (c === "O" ? "◉" : glyph()))
    ).join("\n");
  }

  // Anima um <pre> continuamente com o tubarão de glyphs. Retorna um handle
  // com .stop() pra parar o loop.
  function animateShark(el, interval) {
    if (!el) return { stop: () => {} };
    el.textContent = sharkFrame();
    const iv = setInterval(() => {
      if (el.offsetParent === null) return; // pausa se estiver escondido
      el.textContent = sharkFrame();
    }, interval || 110);
    return { stop: () => clearInterval(iv) };
  }

  root.SHARK_SHAPE = SHARK_SHAPE;
  root.sharkFrame = sharkFrame;
  root.animateShark = animateShark;
})(window);
