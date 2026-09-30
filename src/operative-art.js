// Original inline vector art. No image downloads, filters, or extra render loop.
export function operativeArt(id) {
  const nex = id === 'NEX', aeris = id === 'AERIS', echo = id === 'ECHO', warden = id === 'WARDEN'
  const color = nex ? '#98efb7' : aeris ? '#c6b4ff' : echo ? '#e0a2ff' : warden ? '#ff956b' : '#80e4e6'
  const secondary = warden ? '#4f2926' : echo ? '#34203f' : nex ? '#203b37' : aeris ? '#302e49' : '#24434e'
  const head = nex ? 'M114 54 149 28 185 52 191 101 151 126 110 100Z' : aeris ? 'M111 61 130 36 168 36 190 61 180 108 150 130 121 108Z' : warden ? 'M104 47 196 47 205 108 180 133 119 133 98 108Z' : echo ? 'M109 46 160 28 194 65 176 83 190 105 154 132 108 105 119 78Z' : 'M109 54 130 36 173 36 193 59 187 110 151 133 113 109Z'
  return `<svg class="operative-art art-${id.toLowerCase()}" viewBox="0 0 300 400" fill="none" aria-hidden="true" style="--art-color:${color}">
    <g stroke="${color}" opacity=".22" class="art-orbit"><circle cx="150" cy="181" r="133"/><circle cx="150" cy="181" r="117" stroke-dasharray="2 12"/><path d="M150 26v27m0 256v27M0 181h31m238 0h31"/></g>
    ${aeris ? `<g class="art-temporal" stroke="${color}" opacity=".5"><ellipse cx="150" cy="189" rx="139" ry="49" transform="rotate(-32 150 189)"/><ellipse cx="150" cy="189" rx="139" ry="49" transform="rotate(32 150 189)"/></g>` : ''}
    <ellipse cx="150" cy="377" rx="90" ry="12" fill="${color}" opacity=".06"/><ellipse cx="150" cy="377" rx="87" ry="10" stroke="${color}" opacity=".25"/>
    <g class="art-body" stroke-linejoin="bevel">
      <path d="M114 267 102 312 109 363 98 374h37l13-93m38-14 12 46-6 49 10 12h-37l-13-93" fill="#0b151d" stroke="${secondary}" stroke-width="3"/>
      <path d="m115 304 13 3-5 42h-10m62-44 12-2-1 45h-10" fill="${secondary}" stroke="${color}" opacity=".55"/>
      ${aeris ? `<path d="m111 126-20 47-12 163 56-35 16-60 15 60 55 35-12-163-22-47" fill="#171a2a" stroke="${secondary}" stroke-width="2"/>` : ''}
      <path d="M100 128 151 119 199 131 211 199 187 268 151 288 111 268 89 199Z" fill="#0c1822" stroke="${color}" stroke-width="1.5"/>
      <path d="m105 134 45 16 44-16-4 41-39 24-42-25Z" fill="${secondary}" stroke="${color}" opacity=".8"/>
      <path d="m109 183 31 22 1 61-26-13-11-47m83-23-30 22-2 61 25-13 14-47" fill="${secondary}"/>
      <path d="m119 221 22 8m-19 7 19 8m38-23-21 8m18 7-18 8" stroke="${color}" opacity=".45"/>
      <path d="m100 132-30 5-24 34 17 51 31-14 17-45m88-31 29 5 24 34-17 51-31-14-17-45" fill="${secondary}" stroke="${color}" stroke-width="1.3"/>
      <path d="m69 147-12 26 12 28 22-11m140-43 12 26-12 28-22-11" stroke="${color}" stroke-width="3"/>
      <path d="m64 214-16 51 9 29 26-2 17-76m136-2 16 51-9 29-26-2-17-76" fill="#10212a" stroke="${secondary}" stroke-width="4"/>
      <path d="m58 266 18 3m-20 6 18 3m169-12-18 3m20 6-18 3" stroke="${color}"/>
      <path d="${head}" fill="#101d28" stroke="${color}" stroke-width="1.8"/>
      <path d="m127 43 24 10 22-10-2 22-20 10-23-10Z" fill="${secondary}"/>
      <path d="m115 73 36 12 36-12-6 23-30 12-29-12Z" fill="#030b11" stroke="${secondary}"/>
      <path class="art-visor" d="m122 83 29 10 29-10-3 8-26 10-25-10Z" fill="${color}"/>
      <path d="m137 113 14 7 15-7m-40-51-5 6m55-6 5 6" stroke="${color}" opacity=".65"/>
      <path d="m151 158 19 16-19 26-19-26Z" fill="#060f18" stroke="${color}"/>
      <path class="art-core" d="m151 167 10 8-10 14-10-14Z" fill="${color}"/>
      <path d="m132 260 19 11 18-11-2 16-16 10-17-10Z" fill="${secondary}" stroke="${color}" opacity=".75"/>
      ${nex ? `<g stroke="${color}" opacity=".8"><path d="M83 147v-31h20m111 46h18v57h-15M100 232h-17v17m79-111h17v15"/><path d="M42 192h25m170-54h24m-40 100h34" stroke-dasharray="3 5"/></g>` : ''}
      ${warden ? `<path d="m46 158-10-45 57 9 16 33m99 0 3-33 57-9-11 45M122 57h58v9h-58" fill="${secondary}" stroke="${color}" stroke-width="2"/>` : ''}
    </g>
    ${echo ? `<g class="art-fragments" fill="${secondary}" stroke="${color}"><path d="m53 67 26-18-4 46Z"/><path d="m232 40 17 42-27-13Z"/><path d="m21 219 25 16-10 28Z"/><path d="m263 183 21 27-32 5Z"/><path d="m209 301 29 22-23 20Z"/><path d="M96 100h77m-51 94h83M95 234h101" stroke="#ff789d" stroke-width="3"/></g>` : ''}
  </svg>`
}
