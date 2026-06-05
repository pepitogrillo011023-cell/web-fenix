/**
 * Slot Machine Generator (MODIFICADO PARA CASINO FÉNIX)
 * El cerebro ahora está en el servidor (backend) por seguridad.
 *
 * Original Copyright 2020-2025, Marc S. Brooks
 */

'use strict';

function SlotMachine(container, reels, callback, options) {
  const self = this;
  const REEL_SEGMENT_TOTAL = 24;

  const defaults = {
    reelHeight: 1200,
    reelWidth:  200,
    reelOffset: 20,
    slotYAxis:  0,
    animSpeed:  1000,
    click2Spin: true,
    sounds: {
      reelsBegin: null,
      reelsEnd: null
    }
  };

  (function() {
    self.options = Object.assign(defaults, options);
    if (reels.length > 0) {
      initGame();
    } else {
      throw new Error('Failed to initialize (missing reels)');
    }
  })();

  function initGame() {
    container.setAttribute('aria-label', 'Slot machine');
    createDisplayElm();
    createSlotElm();
  }

  function createDisplayElm() {
    const div = document.createElement('div');
    div.classList.add('display');

    for (let i = 0; i < reels.length; i++) {
      const elm = document.createElement('div');
      elm.classList.add('reel');
      elm.setAttribute('role', 'none');
      elm.style.transform = `rotateY(${self.options.slotYAxis}deg)`;
      div.appendChild(elm);
    }
    
    // Anulamos el click2Spin original porque ahora se maneja desde el index.html
    container.appendChild(div);
  }

  function createSlotElm() {
    const div = document.createElement('div');
    div.classList.add('slots');
    div.setAttribute('aria-label', 'Reels');

    reels.forEach((reel, index) => {
      const elm = createReelElm(reel, reel.symbols[0].position);
      elm.setAttribute('aria-label', `Reel ${index + 1}`);
      div.appendChild(elm);
    });

    container.appendChild(div);
  }

  function createReelElm(config, startPos = 0) {
    const div = document.createElement('div');
    div.style.transform = `rotateY(${self.options.slotYAxis}deg)`;
    div.classList.add('reel');

    const elm = createStripElm(config, startPos);
    config['element'] = elm;
    div.appendChild(elm);

    return div;
  }

  function createStripElm(config, startPos = 0) {
    const stripHeight = getStripHeight();
    const stripWidth  = getStripWidth();
    const segmentDeg = 360 / REEL_SEGMENT_TOTAL;
    const transZ = Math.trunc(Math.tan(90 / Math.PI - segmentDeg) * (stripHeight * 0.5) * 4);
    const marginTop = transZ + stripHeight / 2;

    const ul = document.createElement('ul');
    ul.style.height    = stripHeight + 'px';
    ul.style.marginTop = marginTop   + 'px';
    ul.style.width     = stripWidth  + 'px';
    ul.classList.add('strip');

    for (let i = 0; i < REEL_SEGMENT_TOTAL; i++) {
      const li = document.createElement('li');
      const imgPosY = getImagePosY(i, startPos);
      const rotateX = (REEL_SEGMENT_TOTAL * segmentDeg) - (i * segmentDeg);

      li.style.background = `url(${config.imageSrc}) 0 ${imgPosY}px`;
      li.style.height     = stripHeight + 'px';
      li.style.width      = stripWidth  + 'px';
      li.style.transform  = `rotateX(${rotateX}deg) translateZ(${transZ}px)`;

      ul.appendChild(li);
    }
    return ul;
  }

  function getImagePosY(index, position) {
    return -Math.abs((getStripHeight() * index) + (position - self.options.reelOffset));
  }

  function getStripHeight() { return self.options.reelHeight / REEL_SEGMENT_TOTAL; }
  function getStripWidth() { return self.options.reelWidth; }
  
  function playSound(url) {
    if (url) {
      const audio = new Audio();
      audio.src = url;
      audio.onerror = () => console.warn(`Failed to load audio: ${url}`);
      audio.play();
    }
  }

  // ==============================================================
  // 🔥 NUEVA LÓGICA DE GIRO CONTROLADA POR EL SERVIDOR
  // ==============================================================
  
  self.startSpinAnimation = function() {
    playSound(self.options.sounds.reelsBegin);
    reels.forEach(reel => {
      const elm = reel.element;
      elm.classList.remove('stop');
      elm.classList.add('spin');
    });
  };

  self.stopSpinAndShowResult = function(resultadoArray) {
    // resultadoArray debe ser algo como ['Cereza', 'Cereza', 'Limon'] (Nombres de las figuras)
    
    reels.forEach((reel, index) => {
      const elm = reel.element;
      
      // Buscamos el símbolo que mandó el servidor en la configuración del reel
      const simboloGanador = reel.symbols.find(s => s.name === resultadoArray[index]);
      
      // Si el servidor mandó algo raro, frenamos en la primera posición por defecto
      const finalPos = simboloGanador ? simboloGanador.position : reel.symbols[0].position;

      // Retrasamos el frenado de cada rodillo para darle suspenso (efecto cascada)
      setTimeout(() => {
        elm.classList.replace('spin', 'stop');
        
        // Ajustamos la imagen a la posición ganadora
        elm.childNodes.forEach((li, idx) => {
          li.style.backgroundPositionY = getImagePosY(idx, finalPos) + 'px';
        });

        playSound(self.options.sounds.reelsEnd);
        
        // Si es el último rodillo en frenar, llamamos al callback
        if (index === reels.length - 1 && callback) {
           setTimeout(() => { callback(resultadoArray); }, 500);
        }

      }, index * 800); // 800ms de diferencia entre cada rodillo
    });
  };

  return self;
}

window.slotMachine = function(container, reels, callback, options) {
  return new SlotMachine(container, reels, callback, options);
};