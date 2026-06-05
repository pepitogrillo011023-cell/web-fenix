JavaScript
'use strict';

function SlotMachine(container, reels, callback, options) {
    const self = this;
    
    function createReelElm(config) {
        const div = document.createElement('div');
        div.classList.add('reel');
        const ul = document.createElement('ul');
        ul.classList.add('strip');
        
        for (let i = 0; i < 12; i++) {
            const indexSimbolo = i % 6; 
            const li = document.createElement('li');
            li.style.backgroundImage = `url("${config.imageSrc}")`;
            li.style.backgroundPosition = `0px -${indexSimbolo * 150}px`;
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
            let pos = -900; 
            // BAJAMOS LA VELOCIDAD DE 25 a 12 PARA QUE GIRE SUAVE Y PESADO
            const speed = 12; 
            
            function animate() {
                pos += speed; 
                if (pos >= 0) pos = -900 + pos; 
                
                r.element.style.marginTop = pos + "px";
                r.animationId = requestAnimationFrame(animate); 
            }
            
            r.animationId = requestAnimationFrame(animate);
        });
    };

    self.stopSpinAndShowResult = function(resultadoArray) {
        reels.forEach((reel, index) => {
            const ul = reel.element;
            const simbolo = reel.symbols.find(s => s.name === resultadoArray[index]);
            const finalPos = simbolo ? simbolo.position : 0;

            setTimeout(() => {
                cancelAnimationFrame(reel.animationId); 
                
                // EFECTO DE TRABA MECÁNICA (Rebote)
                // Usamos cubic-bezier para que "se pase" un poco del centro y vuelva, como si trabara.
                ul.style.transition = "margin-top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"; 
                ul.style.marginTop = `-${finalPos}px`; 
                
                setTimeout(() => {
                    ul.style.transition = "none"; 
                    if (index === reels.length - 1 && callback) callback(resultadoArray);
                }, 400); // Esperamos 0.4s a que termine el rebote

            }, 1000 + (index * 400)); 
        });
    };
    return self;
}

window.slotMachine = (c, r, cb, o) => new SlotMachine(c, r, cb, o);
