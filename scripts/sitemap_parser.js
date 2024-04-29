const convert = require('xml-js');
const fs = require('fs');

const oldXmlFile = fs.readFileSync('sitemap_old.xml', 'utf8');
const oldJsonData = JSON.parse(convert.xml2json(oldXmlFile, {compact: true, spaces: 2}));
const oldPaths = oldJsonData.urlset.url.map(_ => _.loc._text.replace('https://www.gardencityplastics.com/', ''));
const newXmlFile = fs.readFileSync('sitemap_0.xml', 'utf8');
const newJsonData = JSON.parse(convert.xml2json(newXmlFile, {compact: true, spaces: 2}));
const matcher = /[a-z0-9]*(--)?[a-z0-9]*(--)?[a-z0-9]+(--)?$/ig;
const lines = newJsonData.urlset.url.map(_ =>
    _.loc._text.replace('com/en-au/', 'com/')
).filter(
    _ => !_.endsWith('/')
).map(url => {
    const alias = url.match(matcher) ? url.match(matcher)[0] : '';
    const n = alias.replace(/\-\-/g, '-');
    return [`${n}.html`, url.replace('https://beta.', 'https://'), 1];
}).filter(
    _ => oldPaths.includes(_[0])
);
const heading = ['Alias', 'Link', 'Permanent'];

var file = fs.createWriteStream('product_page_redirects.csv');
file.write(heading.join(',') + '\n')
lines.forEach(_ => file.write(_.join(',') + '\n'));
file.end();



console.log(lines.length)