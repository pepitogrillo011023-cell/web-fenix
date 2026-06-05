'use strict';

function SlotMachine(container, reels, callback, options) {
    const self = this;
    
    function createReelElm(config) {
        const div = document.createElement('div');
        div.classList.add('reel');
        const ul = document.createElement('ul');
        ul.classList.add('strip');
        
        for (let i = 0; i < 6; i++) {
            const li = document.createElement('li');
            li.style.backgroundImage = `url("${config.imageSrc}")`;
            li.style.backgroundPosition = `0px -${i * 150}px`;
            ul.appendChild(li);
        }
        config['element'] = ul;
        div.appendChild(ul);
        return div;
    }

    const divSlots = document.createElement('div');
    divSlots.classList.add('slots');
    divSlots.style.display = "flex";
    reels.forEach(reel => divSlots.appendChild(createReelElm(reel)));
    container.appendChild(divSlots);

    self.startSpinAnimation = function() {
        reels.forEach(r => {
            let pos = 0;
            r.interval = setInterval(() => {
                pos -= 30; 
                if (pos <= -900) pos = 0; 
                r.element.style.marginTop = pos + "px";
            }, 30);
        });
    };

    self.stopSpinAndShowResult = function(resultadoArray) {
        reels.forEach((reel, index) => {
            const ul = reel.element;
            const simbolo = reel.symbols.find(s => s.name === resultadoArray[index]);
            const finalPos = simbolo ? simbolo.position : 0;

            setTimeout(() => {
                clearInterval(reel.interval); 
                ul.style.marginTop = `-${finalPos}px`; 
                // AQUÍ PASAMOS EL RESULTADO AL CALLBACK
                if (index === reels.length - 1 && callback) callback(resultadoArray);
            }, 1000 + (index * 400));
        });
    };
    return self;
}

window.slotMachine = (c, r, cb, o) => new SlotMachine(c, r, cb, o);
