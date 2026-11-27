/**
 * Responsabilidad Única: Auditar la coherencia semántica, técnica y visual entre cada escena
 * narrada (`scene.dsl.json`) y su fotografía asignada, detectando SVGs prohibidos, URLs rotas,
 * nombres de archivo fuera de tema y generando hojas de contacto visuales para inspección multimodal.
 *
 * Uso:
 *   node scripts/audit_scene_images.mjs projects/<id>/scene.dsl.json [--sheets <outDir>] [--no-download]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BANNED_FILENAME_PATTERNS = [
  { re: /electrolytic|1cm3_cube/i, reason: 'Metal industrial de laboratorio (no alimento)' },
  { re: /sample_of_iodine|^potassium\.jpg$/i, reason: 'Elemento químico crudo de laboratorio (no alimento)' },
  { re: /black_rot|blight|disease|caterpillar|pieris|larva|mildew|fungus/i, reason: 'Plaga o enfermedad vegetal' },
  { re: /acer_palmatum|maple/i, reason: 'Hoja de arce (off-topic para nutrición/repollo)' },
  { re: /wwe|wrestl|baseball|football|concert/i, reason: 'Contenido deportivo/espectáculo fuera de tema' },
  { re: /phytomenadione|ampoule|syringe|vial/i, reason: 'Frasco o ampolla farmacéutica' }
];

// Mapa bilingüe de conceptos concretos: si la narración enfatiza un concepto, los términos EN/ES esperables en la foto
const CONCEPT_GROUPS = [
  { id: 'cabbage', es: /\b(repollo|col\b|lombarda|cruc[ií]feras?|coleslaw|savoy)/i, img: /(cabbage|kohl|kapusta|brassica|coleslaw|sauerkraut|choucroute|savoy|lombarda|repollo)/i },
  { id: 'red_cabbage', es: /\b(repollo morado|col morada|lombarda|antocianinas?|violeta)/i, img: /(red_cabbage|purple_cabbage|rotkohl|modra_kapusta|lombarda|red.*cabbage)/i },
  { id: 'lentils', es: /\b(lentejas?|legumbres?|lens culinaris)/i, img: /(lentil|linsen|lens_culinaris|legume|lenteja|dal|daal|stew|soup|salad)/i },
  { id: 'tea_coffee', es: /\b(t[eé]\s+verde|tomar\s+t[eé]|caf[eé]\b)/i, img: /(tea|coffee|cafe|matcha|infusion|cup|mug)/i },
  { id: 'lemon', es: /\b(lim[oó]n|limones|c[ií]trico)/i, img: /(lemon|limon|citrus|lime)/i },
  { id: 'olive_oil', es: /\b(aceite de oliva)/i, img: /(olive|oliwa|aceite)/i },
  { id: 'parsley', es: /\b(perejil)/i, img: /(parsley|petroselinum|perejil)/i },
  { id: 'garlic', es: /\b(ajo\b)/i, img: /(garlic|allium_sativum|ajo)/i },
  { id: 'onion', es: /\b(cebolla)/i, img: /(onion|allium_cepa|cebolla)/i },
  { id: 'carrot', es: /\b(zanahoria)/i, img: /(carrot|daucus|zanahoria)/i },
  { id: 'bay_leaf', es: /\b(laurel)/i, img: /(bay_lea|laurel|laurus)/i },
  { id: 'cumin', es: /\b(comino)/i, img: /(cumin|cuminum|comino)/i },
  { id: 'fennel', es: /\b(hinojo)/i, img: /(fennel|foeniculum|hinojo|chamomile|manzanilla)/i },
  { id: 'ginger', es: /\b(jengibre)/i, img: /(ginger|zingiber|jengibre)/i },
  { id: 'sauerkraut', es: /\b(chucrut|fermentad)/i, img: /(sauerkraut|choucroute|ferment|kimchi)/i },
  { id: 'water', es: /\b(agua\b|hidrataci[oó]n)/i, img: /(water|agua|glass|vaso|drinking)/i },
  { id: 'heart', es: /\b(coraz[oó]n|arterias?|cardiovascular)/i, img: /(heart|corazon|cardio|artery|mediterran|walking|olive)/i },
  { id: 'blood_pressure', es: /\b(presi[oó]n arterial|tensi[oó]n|sodio)/i, img: /(blood_pressure|sphygmomanometer|pressure|potassium|salt|herb)/i },
  { id: 'glucose', es: /\b(glucosa|gluc[eé]mic|az[uú]car en sangre|insulina)/i, img: /(glucose|glucopyranose|meter|glucometer|lunch|lentil|salad)/i },
  { id: 'thyroid', es: /\b(tiroides|hipotiroidismo|boci[oó]genos)/i, img: /(thyroid|tiroides|steamed|cooking|cabbage|seaweed|kelp|salt)/i },
  { id: 'microbiota', es: /\b(microbiota|microbioma|bacterias buenas|flora intestinal|colon)/i, img: /(microbio|bacteria|gut|intestin|vegetable|produce|sauerkraut|fiber|salad)/i },
  { id: 'soaking_canned', es: /\b(remoja|enjuaga|lata|conservas?|escurre)/i, img: /(soak|rinse|colander|strainer|canned|tin|wash|water|lentil|bean)/i },
  { id: 'cooking_steam', es: /\b(hierves|saltead|vapor|olla|guiso|sopa|cocin|sart[eé]n)/i, img: /(cook|steam|boil|pot|stew|soup|pan|saute|wok|kitchen|cabbage|lentil)/i },
  { id: 'tomato', es: /\b(tomate)/i, img: /(tomato|tomate)/i },
  { id: 'vinegar', es: /\b(vinagre)/i, img: /(vinegar|vinagre)/i },
  { id: 'herbs', es: /\b(hierbas frescas|cilantro)/i, img: /(herb|cilantro|parsley|coriander|spices)/i },
  { id: 'walking_senior', es: /\b(50|mayores|camin|independencia|h[aá]bitos)/i, img: /(senior|elder|walking|couple|park|active|healthy|salad|meal)/i },
  { id: 'doctor_caution', es: /\b(m[eé]dico|anticoagulantes?|precauciones?|warfarina)/i, img: /(stethoscope|doctor|medical|medicine|pill|cabbage|leaf|green)/i },
  { id: 'broccoli_kale', es: /\b(br[oó]coli|cruc[ií]feras|glucosinolatos|mirosinasa)/i, img: /(broccoli|kale|cabbage|brassica|chopping|sliced)/i },
  { id: 'meal_prep', es: /\b(semana|congela|porciones|tupper|domingo|recipientes)/i, img: /(meal_prep|container|bowl|portion|soup|lentil|cabbage|kitchen)/i }
];

// Ingredientes muy específicos en nombres de archivo que delatan una foto "nada que ver" si NO se mencionan en la frase
const SPECIFIC_PHOTO_SUBJECTS = [
  { imgRe: /capsicum|bell_pepper|paprika|piment[oó]n/i, esRe: /\b(pimiento|morr[oó]n|piment[oó]n|aj[ií])/i, label: 'Pimiento/Pimentón' },
  { imgRe: /red_onion|ars_red_onion/i, esRe: /\b(cebolla)/i, label: 'Cebolla morada' },
  { imgRe: /carrots?_01|daucus_carota/i, esRe: /\b(zanahoria)/i, label: 'Zanahoria' },
  { imgRe: /citrus_fruits|orange/i, esRe: /\b(naranja|c[ií]trico|lim[oó]n)/i, label: 'Cítricos/Naranjas' },
  { imgRe: /loureiro|laurus_nobilis|bay_lea/i, esRe: /\b(laurel|hierba)/i, label: 'Laurel' },
  { imgRe: /zingiber|ginger|koeh-146/i, esRe: /\b(jengibre)/i, label: 'Jengibre' },
  { imgRe: /börülce|cowpea|black_eyed/i, esRe: /\b(poroto|frijol|alubia|conserva)/i, label: 'Otra legumbre (no lentejas)' },
  { imgRe: /acer_palmatum|maple/i, esRe: /\b(arce|oto[ñn]o)/i, label: 'Árbol arce japonés' },
  { imgRe: /potassium\.jpg/i, esRe: /\b(metal|laboratorio)/i, label: 'Potasio metálico de laboratorio' },
  { imgRe: /iron_electrolytic|1cm3_cube/i, esRe: /\b(metal|cubo)/i, label: 'Hierro metálico industrial' },
  { imgRe: /sample_of_iodine/i, esRe: /\b(mineral puro|laboratorio)/i, label: 'Cristales crudos de yodo' },
  { imgRe: /phytomenadione/i, esRe: /\b(ampolla|inyecci[oó]n)/i, label: 'Ampolla médica' }
];

function extractScenes(scene) {
  const nodeMap = new Map(scene.nodes.map((n) => [n.id, n]));
  const imageNodes = scene.nodes.filter((n) => n.type === 'image');

  return imageNodes.map((imgNode, index) => {
    const prefix = imgNode.id.replace(/-visual$/, '');
    const titleNode = nodeMap.get(`${prefix}-titulo`);
    const subNode = nodeMap.get(`${prefix}-subtitulo`);
    const url = imgNode.src || '';
    const fileName = decodeURIComponent(url.split('?')[0].split('/').pop() || '');

    return {
      index: index + 1,
      prefix,
      visualId: imgNode.id,
      title: titleNode?.text || imgNode.label || '',
      subtitle: titleNode?.subtitle || '',
      narration: subNode?.text || '',
      caption: imgNode.label || '',
      imageQuery: imgNode.imageQuery || '',
      src: url,
      fileName
    };
  });
}

function evaluateSceneCoherence(item) {
  const spokenContext = `${item.title} ${item.subtitle} ${item.narration}`;
  const issues = [];
  let severity = 'OK';

  // 1. Verificar patrones prohibidos en el archivo
  for (const ban of BANNED_FILENAME_PATTERNS) {
    if (ban.re.test(item.fileName)) {
      issues.push(`PROHIBIDO: ${ban.reason} (${item.fileName})`);
      severity = 'MISMATCH';
    }
  }

  // 2. Verificar si la foto muestra un ingrediente/objeto muy específico que NO se menciona en el texto
  for (const spec of SPECIFIC_PHOTO_SUBJECTS) {
    if (spec.imgRe.test(item.fileName) && !spec.esRe.test(spokenContext)) {
      issues.push(`Foto de "${spec.label}" no coincide con el texto hablado`);
      severity = 'MISMATCH';
    }
  }

  // 3. Verificar si el texto habla de un concepto claro pero el nombre de archivo no tiene afinidad
  const expectedGroups = CONCEPT_GROUPS.filter((g) => g.es.test(spokenContext));
  if (expectedGroups.length > 0) {
    const anyMatch = expectedGroups.some((g) => g.img.test(item.fileName));
    if (!anyMatch) {
      const expectedIds = expectedGroups.map((g) => g.id).join(', ');
      issues.push(`Archivo "${item.fileName}" sin afinidad directa con [${expectedIds}]`);
      if (severity !== 'MISMATCH') severity = 'WARN';
    }
  }

  // 4. Comprobar URL directa de Wikimedia
  if (!item.src.startsWith('https://')) {
    issues.push('Falta URL directa verificada (`src`)');
    severity = 'MISMATCH';
  }

  return { severity, issues };
}

async function downloadThumbnail(url, destPath) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'JuanaLaSanaEditor/1.0 (https://github.com/Lorenzo-Imvinkelried/editor_youtube)'
        }
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status };
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) return { ok: false, status: res.status, contentType: ct };
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buf);
      return { ok: true, status: 200, bytes: buf.length, contentType: ct };
    } catch (err) {
      if (attempt === 2) return { ok: false, status: 0, error: String(err) };
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return { ok: false, status: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const scenePath = args[0];
  if (!scenePath || !fs.existsSync(scenePath)) {
    console.error('Uso: node scripts/audit_scene_images.mjs <projects/.../scene.dsl.json> [--sheets <outDir>] [--no-download]');
    process.exit(1);
  }

  const sheetsIdx = args.indexOf('--sheets');
  const sheetsDir = sheetsIdx !== -1 ? args[sheetsIdx + 1] : null;
  const noDownload = args.includes('--no-download');

  const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  const svgNodes = scene.nodes.filter((n) => n.type === 'svg');
  const items = extractScenes(scene);

  console.log(`\n=== AUDITORÍA DE COHERENCIA VISUAL: ${scenePath} ===`);
  console.log(`Escenas con imagen: ${items.length} | Nodos SVG prohibidos: ${svgNodes.length}`);

  const reportItems = [];
  let mismatchCount = 0;
  let warnCount = 0;
  let brokenCount = 0;

  let thumbsDir = null;
  if (sheetsDir && !noDownload) {
    thumbsDir = path.join(sheetsDir, 'thumbs');
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const evalRes = evaluateSceneCoherence(item);
    let localFile = null;
    let httpStatus = null;

    if (thumbsDir && item.src) {
      const ext = item.fileName.toLowerCase().endsWith('.png') ? '.png' : '.jpg';
      const dest = path.join(thumbsDir, `${String(item.index).padStart(3, '0')}_${item.prefix}${ext}`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
        localFile = dest;
        httpStatus = 200;
      } else {
        const dl = await downloadThumbnail(item.src, dest);
        httpStatus = dl.status;
        if (dl.ok) {
          localFile = dest;
        } else {
          brokenCount++;
          evalRes.severity = 'MISMATCH';
          evalRes.issues.push(`Descarga fallida (HTTP ${dl.status})`);
        }
        await new Promise((r) => setTimeout(r, 95));
      }
      if ((i + 1) % 20 === 0 || i === items.length - 1) {
        console.log(`  Descargadas para hoja de contacto: ${i + 1}/${items.length}`);
      }
    }

    if (evalRes.severity === 'MISMATCH') mismatchCount++;
    else if (evalRes.severity === 'WARN') warnCount++;

    reportItems.push({
      ...item,
      severity: evalRes.severity,
      issues: evalRes.issues,
      httpStatus,
      localFile
    });
  }

  console.log(`\nRESUMEN AUTOMÁTICO: OK=${items.length - mismatchCount - warnCount} | WARN=${warnCount} | MISMATCH=${mismatchCount} | HTTP_BROKEN=${brokenCount}`);
  for (const r of reportItems) {
    if (r.severity !== 'OK') {
      console.log(`  [${r.severity}] #${String(r.index).padStart(2, '0')} ${r.prefix} | ${r.issues.join(' ; ')}`);
      console.log(`      TITULO: ${r.title} | VOZ: ${r.narration}`);
    }
  }

  if (sheetsDir) {
    fs.mkdirSync(sheetsDir, { recursive: true });
    const reportPath = path.join(sheetsDir, 'audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ scenePath, svgCount: svgNodes.length, items: reportItems }, null, 2), 'utf8');

    if (!noDownload && process.platform === 'win32') {
      const psScript = path.resolve('scripts/render_contact_sheets.ps1');
      if (fs.existsSync(psScript)) {
        console.log(`\nGenerando hojas de contacto visuales en ${sheetsDir}...`);
        const out = execFileSync(
          'powershell',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-ReportPath', reportPath, '-OutDir', sheetsDir],
          { encoding: 'utf8' }
        );
        console.log(out.trim());
      }
    }
  }

  if (svgNodes.length > 0 || brokenCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
