const https = require('https');
const http = require('http');
const fs = require('fs');

const DOC_ID = '1oaYcp2PCJqHqZ8IIu80GJ-okbVsHMwojvrq2-fnczVM';
const URL = `https://docs.google.com/document/d/${DOC_ID}/export?format=docx`;
const DEST = 'plantilla_packing.docx';

function download(url, dest, cb) {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
            return download(res.headers.location, dest, cb);
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); cb(null); });
    }).on('error', e => { fs.unlink(dest, () => { }); cb(e); });
}

download(URL, DEST, err => {
    if (err) { console.error('Error:', err.message); process.exit(1); }
    const size = fs.statSync(DEST).size;
    console.log(`OK — plantilla_packing.docx descargada (${size} bytes)`);
});
