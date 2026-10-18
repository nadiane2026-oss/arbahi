// يجعل خط Cairo محلياً داخل التطبيق (يعمل بدون إنترنت). يُشغَّل أثناء البناء في GitHub فقط.
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const src = 'node_modules/@fontsource-variable/cairo';
if (!existsSync(src)) { console.log('خط Cairo غير مثبّت: سيُستعمل الخط من الإنترنت'); process.exit(0); }
mkdirSync('www/fonts', { recursive: true });
cpSync(`${src}/files`, 'www/fonts', { recursive: true });
const css = readFileSync(`${src}/index.css`, 'utf8').replaceAll('./files/', '../fonts/');
writeFileSync('www/css/cairo.css', css);
console.log('تم تثبيت خط Cairo محلياً');
