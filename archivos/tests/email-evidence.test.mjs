import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceEmailHtml,evidenceEmailPlain,safeEvidenceUrl} from '../email-evidence.js';

const driveLink='https://drive.google.com/file/d/abcDEF123456789/view';
test('evidencia privada no depende de miniaturas que requieren credenciales',()=>{
 const html=evidenceEmailHtml([driveLink,driveLink],'Vistas de artes y aplicaciones');
 assert.match(html,/Fotografía 1/);
 assert.match(html,/Fotografía 2/);
 assert.match(html,/Abrir fotografía/);
 assert.match(html,/drive\.google\.com\/file\/d/);
 assert.doesNotMatch(html,/<img\b/i);
 assert.doesNotMatch(html,/thumbnail|usercontent\.google\.com/i);
 assert.doesNotMatch(html,/anyone/);
 assert.match(html,/la cuenta que recibió permiso/);
});
test('sanea URL maliciosa, evita atributos HTML inyectados',()=>{
 const html=evidenceEmailHtml(['javascript:alert(1)','data:text/html,hello','http://example.com/image.png',
   'https://example.com/hello?x="><script>alert(1)</script>'],'<img src=1 onerror=alert(1)>');
 assert.doesNotMatch(html,/<img\b|<script\b/i);
 assert.match(html,/&lt;img src=1 onerror=alert\(1\)&gt;/);
 assert.match(html,/&quot;&gt;&lt;script&gt;/);
 assert.equal(safeEvidenceUrl('javascript:alert(1)'),'');
});
test('el texto plano incluye enlaces individuales para Gmail',()=>{
 const plain=evidenceEmailPlain([driveLink,driveLink],'Evidencia');
 assert.match(plain,/Evidencia:/);
 assert.match(plain,/1\. https:\/\/drive\.google\.com/);
 assert.match(plain,/2\. https:\/\/drive\.google\.com/);
 assert.equal(evidenceEmailPlain([], 'Evidencia'),'');
});
