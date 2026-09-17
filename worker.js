/* ═══════════════════════════════════════════════════════════════════════
   Preparação da imagem FORA da linha de execução da tela.

   Decodificar uma foto de 12 MP é caro — uns poucos segundos em celular
   comum. Feito na linha principal, o app não fica lento: fica CONGELADO,
   sem responder a toque, o que o usuário lê como travamento. Aqui ele só
   fica ocupado, e a tela continua viva mostrando o progresso.

   Duas etapas, e a divisão existe por memória:

   preparar  decodifica a foto original UMA vez, reduz para 2000px e devolve
             um JPEG de trabalho (~400 KB). O bitmap gigante morre aqui; se
             ficasse vivo, seis páginas ocupariam centenas de MB e o
             navegador mataria a aba no meio do cadastro.
   final     decodifica o JPEG de trabalho (barato), recorta a margem que o
             usuário marcou, reduz para o lado final e grava na qualidade de
             armazenamento.

   O dobro de codificação custa qualidade invisível em documento (0,9 depois
   0,75) e compra estabilidade num aparelho com pouca memória.
   ═══════════════════════════════════════════════════════════════════════ */

const LADO_TRABALHO = 2000;
const QUALIDADE_TRABALHO = 0.9;

async function desenhar(bitmap, destL, destA, recorte) {
  const tela = new OffscreenCanvas(destL, destA);
  const ctx = tela.getContext("2d");
  // Fundo branco: documento com transparência viraria borda preta no JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, destL, destA);
  ctx.imageSmoothingQuality = "high";
  if (recorte) {
    ctx.drawImage(bitmap, recorte.x, recorte.y, recorte.l, recorte.a, 0, 0, destL, destA);
  } else {
    ctx.drawImage(bitmap, 0, 0, destL, destA);
  }
  return tela;
}

async function preparar(arquivo) {
  // `from-image` respeita o EXIF. Sem isso, metade dos documentos sai deitada:
  // o canvas ignora a orientação que a câmera gravou.
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_TRABALHO / Math.max(bitmap.width, bitmap.height));
  const l = Math.round(bitmap.width * escala);
  const a = Math.round(bitmap.height * escala);
  const tela = await desenhar(bitmap, l, a, null);
  bitmap.close();
  const blob = await tela.convertToBlob({ type: "image/jpeg", quality: QUALIDADE_TRABALHO });
  return { blob, largura: l, altura: a };
}

/* Gira em passos de 90°, ANTES do recorte.

   A ordem importa e não é arbitrária: a marca de recorte é feita pelo
   usuário sobre a imagem já girada na tela, então as frações que ele
   manda descrevem o quadro girado. Recortar primeiro e girar depois
   aplicaria a marca no quadro errado — o corte sairia rodado 90°.

   Por que existe: na medição de 17/09, as fotos vinham com o celular
   deitado e o documento em pé. O papel ocupava um terço do quadro, e a
   data ficava sem pixels suficientes para ser lida. Girar devolve ao
   documento a altura inteira da foto — foi o que levou o acerto da data
   de 1/4 para 3/4. É resolução, não modelo. */
function rotacionar(bitmap, giro) {
  if (!giro) return bitmap;
  const trocado = giro % 180 !== 0;
  const l = trocado ? bitmap.height : bitmap.width;
  const a = trocado ? bitmap.width : bitmap.height;
  const tela = new OffscreenCanvas(l, a);
  const ctx = tela.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  // Gira em torno do centro do DESTINO e desenha a origem centrada nele:
  // vale para os quatro ângulos sem caso especial.
  ctx.translate(l / 2, a / 2);
  ctx.rotate((giro * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return tela;
}

async function final(blobTrabalho, rect, lado, qualidade, giro) {
  const bitmap = await createImageBitmap(blobTrabalho);
  // `fonte` é o bitmap original ou um canvas girado; drawImage aceita os
  // dois, então o resto do caminho não precisa saber qual é.
  const fonte = rotacionar(bitmap, giro || 0);
  // rect vem em frações (0–1) do quadro GIRADO, para não depender da
  // resolução em que a marca foi feita na tela.
  const recorte = {
    x: Math.round(rect.x * fonte.width),
    y: Math.round(rect.y * fonte.height),
    l: Math.max(1, Math.round(rect.l * fonte.width)),
    a: Math.max(1, Math.round(rect.a * fonte.height)),
  };
  const escala = Math.min(1, lado / Math.max(recorte.l, recorte.a));
  const destL = Math.max(1, Math.round(recorte.l * escala));
  const destA = Math.max(1, Math.round(recorte.a * escala));
  const tela = await desenhar(fonte, destL, destA, recorte);
  bitmap.close();
  const blob = await tela.convertToBlob({ type: "image/jpeg", quality: qualidade });
  return { blob, largura: destL, altura: destA };
}

self.onmessage = async (e) => {
  const { id, tipo } = e.data;
  try {
    if (tipo === "preparar") {
      const r = await preparar(e.data.arquivo);
      self.postMessage({ id, ok: true, ...r });
    } else if (tipo === "final") {
      const r = await final(e.data.blob, e.data.rect, e.data.lado,
                            e.data.qualidade, e.data.giro);
      self.postMessage({ id, ok: true, ...r });
    }
  } catch (erro) {
    self.postMessage({ id, ok: false, erro: String(erro && erro.message || erro) });
  }
};
