'use strict';

function SlotMachine(container, reels, callback, options) {
    const self = this;
    
    function createReelElm(config) {
        const div = document.createElement('div');
        div.classList.add('reel');
        const ul = document.createElement('ul');
        ul.classList.add('strip');
        
        // TRUCO DE MAGIA: Duplicamos la tira (12 símbolos en vez de 6) 
        // Esto crea un loop infinito perfecto hacia abajo sin cortes.
        for (let i = 0; i < 12; i++) {
            const indexSimbolo = i % 6; // Repite 0,1,2,3,4,5,0,1,2...
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
            // Arrancamos desde la mitad inferior de la tira larga (-900px)
            let pos = -900; 
            const speed = 25; // Velocidad de caída. Subí este número si querés que gire más rápido.
            
            function animate() {
                pos += speed; // Sumamos píxeles para que caiga por gravedad
                
                // Cuando llega a la copia idéntica de arriba (0px), lo teletransportamos abajo (-900px)
                // El (pos - 0) mantiene los decimales para que no haya ni un micro-salto
                if (pos >= 0) pos = -900 + pos; 
                
                r.element.style.marginTop = pos + "px";
                r.animationId = requestAnimationFrame(animate); // Animación a 60FPS fluidos
            }
            
            // Iniciamos el motor fluido
            r.animationId = requestAnimationFrame(animate);
        });
    };

    self.stopSpinAndShowResult = function(resultadoArray) {
        reels.forEach((reel, index) => {
            const ul = reel.element;
            const simbolo = reel.symbols.find(s => s.name === resultadoArray[index]);
            const finalPos = simbolo ? simbolo.position : 0;

            // El multiplicador de index (index * 400) frena los rodillos en cascada
            setTimeout(() => {
                // Detenemos el motor fluido
                cancelAnimationFrame(reel.animationId); 
                
                // Le damos un micro-efecto de "clavado" al frenar
                ul.style.transition = "margin-top 0.1s ease-out"; 
                ul.style.marginTop = `-${finalPos}px`; 
                
                // Limpiamos todo para el próximo giro
                setTimeout(() => {
                    ul.style.transition = "none"; 
                    if (index === reels.length - 1 && callback) callback(resultadoArray);
                }, 100);

            }, 1000 + (index * 400)); 
        });
    };
    return self;
}

window.slotMachine = (c, r, cb, o) => new SlotMachine(c, r, cb, o);
