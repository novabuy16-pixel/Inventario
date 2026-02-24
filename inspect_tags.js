const fs = require('fs');
const PizZip = require('pizzip');
const content = fs.readFileSync('plantilla_packing.docx', 'binary');
const zip = new PizZip(content);
const xml = zip.files['word/document.xml'].asText();
let text = xml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const matches = text.match(/<<.*?>>/g);
console.log(matches ? matches.join('\n') : 'No tags found');
