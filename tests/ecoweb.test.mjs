import assert from 'node:assert';
import { parseLoginForm, isLoginPage } from '../www/js/ecoweb.js';
const html = `<meta name="csrf-token" content="TOK1"><form method="POST" action="https://x.ecotrack.dz/login"><input type="hidden" name="_token" value="ABC"><input type="text" name="username"><input type="password" name="pwd"></form>`;
const f = parseLoginForm(html);
assert.equal(f.hidden._token, 'ABC'); assert.equal(f.userName, 'username'); assert.equal(f.passName, 'pwd'); assert.equal(f.action, 'https://x.ecotrack.dz/login');
assert.ok(isLoginPage(html)); assert.ok(!isLoginPage('<table></table>'));
const g = parseLoginForm('<meta name="csrf-token" content="Z"><form action="/login"><input name="email" type="email"><input name="password" type="password"></form>');
assert.equal(g.hidden._token, 'Z'); assert.equal(g.userName, 'email');
console.log('✔ ecoweb: نموذج الدخول');
