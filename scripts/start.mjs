// تشغيل: npm start   ثم افتح الرابط الذي يظهر
import { serve } from './serve.mjs';

const first = Number(process.env.PORT) || 8080;
for (let port = first; port < first + 10; port++) {
  try {
    await serve(port);
    console.log('');
    console.log(`  أرباحي يعمل. افتح في المتصفح:  http://localhost:${port}`);
    console.log('  للإيقاف اضغط Ctrl + C');
    console.log('');
    break;
  } catch (e) {
    if (e.code !== 'EADDRINUSE') { console.error('تعذر التشغيل:', e.message); process.exit(1); }
    console.log(`المنفذ ${port} مستعمل، أجرّب الذي بعده…`);
    if (port === first + 9) { console.error('كل المنافذ مستعملة.'); process.exit(1); }
  }
}
