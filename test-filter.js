const path = require('path');
const fontPath = path.join(__dirname, 'fonts', 'impact.ttf').replace(/\\/g, '/');
const text1 = 'DENEME'.replace(/'/g, "\\'").replace(/:/g, "\\:");
const filters = [`drawtext=text='${text1}':fontfile='${fontPath}':fontsize=24:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*5/100`];
console.log(filters);
