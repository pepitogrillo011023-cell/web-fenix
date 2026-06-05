'use strict';

function SlotMachine(container, reels, callback, options) {
    const self = this;
    
    function createReelElm(config) {
        console.log("Creando rodillo para:", config.imageSrc);
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
        config['element'] = ul; // Esto es el <ul> con clase .strip
        div.appendChild(ul);
        return div;
    }

    const divSlots = document.createElement('div');
    divSlots.classList.add('slots');
    divSlots.style.display = "flex";
    reels.forEach(reel => divSlots.appendChild(createReelElm(reel)));
    container.appendChild(divSlots);

    self.startSpinAnimation = function() {
        console.log("Iniciando giro...");
        reels.forEach(r => {
            console.log("Aplicando clase spin a:", r.element);
            r.element.classList.add('spin');
        });
    };

    self.stopSpinAndShowResult = function(resultadoArray) {
        console.log("Parando giros...");
        reels.forEach((reel, index) => {
            const ul = reel.element;
            const simbolo = reel.symbols.find(s => s.name === resultadoArray[index]);
            const finalPos = simbolo ? simbolo.position : 0;

            setTimeout(() => {
                ul.classList.remove('spin');
                ul.style.marginTop = `-${finalPos}px`;
                console.log("Rodillo " + index + " frenado en:", finalPos);
                if (index === reels.length - 1 && callback) callback();
            }, 1000 + (index * 500));
        });
    };
    return self;
}

window.slotMachine = (c, r, cb, o) => new SlotMachine(c, r, cb, o);
