// Local CC BY 4.0 texture data; see THIRD_PARTY_NOTICES.md.
import t_earth_1 from './tex-earth-1.js';
import t_earth_clouds_1 from './tex-earth-clouds-1.js';
import t_earth_clouds_2 from './tex-earth-clouds-2.js';
import t_mars_1 from './tex-mars-1.js';
import t_mars_2 from './tex-mars-2.js';
import t_jupiter_1 from './tex-jupiter-1.js';
import t_saturn_1 from './tex-saturn-1.js';
import t_neptune_1 from './tex-neptune-1.js';
import t_mercury_1 from './tex-mercury-1.js';
import t_mercury_2 from './tex-mercury-2.js';
import t_venus_1 from './tex-venus-1.js';
import t_uranus_1 from './tex-uranus-1.js';
import t_sun_1 from './tex-sun-1.js';
import t_sun_2 from './tex-sun-2.js';

export const TEXTURES = Object.freeze({
  "earth": [t_earth_1].join(''),
  "earth-clouds": [t_earth_clouds_1,t_earth_clouds_2].join(''),
  "mars": [t_mars_1,t_mars_2].join(''),
  "jupiter": [t_jupiter_1].join(''),
  "saturn": [t_saturn_1].join(''),
  "neptune": [t_neptune_1].join(''),
  "mercury": [t_mercury_1,t_mercury_2].join(''),
  "venus": [t_venus_1].join(''),
  "uranus": [t_uranus_1].join(''),
  "sun": [t_sun_1,t_sun_2].join('')
});
