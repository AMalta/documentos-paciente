/* ═══════════════════════════════════════════════════════════════════════
   A PÁGINA DO MÉDICO — leitura pelo código que o paciente mostra.

   O médico nunca busca paciente: ele recebe. Não há cadastro, não há
   senha, não há lista de pessoas. O único caminho para dentro é um código
   de seis dígitos que o dono do acervo gerou e leu em voz alta.

   COMO ELA LÊ SEM CHAVE DE SERVIÇO. Esta página é pública: qualquer chave
   embutida aqui está ao alcance de quem abrir as ferramentas do navegador,
   e uma chave de serviço entregaria o acervo de TODOS os pacientes. Então
   ela entra como sessão ANÔNIMA — um `auth.uid()` que não é ninguém e não
   enxerga nada — e o `abrir_acervo` carimba esse uid na liberação. Só
   depois disso as políticas do banco passam a deixar aquele uid ler aquele
   paciente, e só enquanto a liberação vive. Ver sql/006_acesso_medico.sql.

   Consequência prática: revogar é instantâneo. O paciente toca em cancelar
   e a próxima consulta desta página não devolve mais nada — sem esperar
   nada expirar, sem sessão para derrubar.
   ═══════════════════════════════════════════════════════════════════════ */
const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

const el = {
  entrada: $("tela-entrada"), acervo: $("tela-acervo"),
  codigo: $("codigo"), nome: $("nome"), crm: $("crm"),
  abrir: $("abrir"), erroEntrada: $("erro-entrada"),
  topoMedico: $("topo-medico"), prazo: $("prazo"), sair: $("sair"),
  busca: $("busca"), corpoBloco: $("corpo-bloco"), corpo: $("corpo"),
  corpoDica: $("corpo-dica"), folhinhas: $("folhinhas"), verTodos: $("ver-todos"),
  contaDocs: $("conta-docs"), grade: $("grade"),
  telaVisu: $("tela-visu"), visuImg: $("visu-img"), visuTitulo: $("visu-titulo"),
  visuConta: $("visu-conta"), visuAntes: $("visu-antes"),
  visuDepois: $("visu-depois"), visuFechar: $("visu-fechar"),
};

let documentos = [];
let regiaoAtiva = null;
let pacienteId = null;

function erro(texto) {
  el.erroEntrada.innerHTML = texto ? `<div class="erro">${texto}</div>` : "";
}

/* ── Entrar ───────────────────────────────────────────────────────────── */
// Só dígitos, e o botão só acende com seis. Deixar o médico tocar em "Abrir"
// com quatro dígitos gasta uma ida ao servidor para dizer o que a própria
// tela já sabia.
el.codigo.oninput = () => {
  el.codigo.value = el.codigo.value.replace(/\D/g, "").slice(0, 6);
  el.abrir.disabled = el.codigo.value.length !== 6;
  erro("");
};
el.codigo.onkeydown = (e) => {
  if (e.key === "Enter" && el.codigo.value.length === 6) el.abrir.click();
};
el.abrir.disabled = true;

el.abrir.onclick = async () => {
  const nome = (el.nome.value || "").trim();
  if (!nome) {
    erro("Escreva seu nome. O paciente vê quem abriu o acervo dele — "
       + "é o que torna este acesso prestável de contas.");
    el.nome.focus();
    return;
  }
  el.abrir.disabled = true;
  el.abrir.textContent = "Abrindo…";
  erro("");
  try {
    // Sessão anônima nova a cada abertura: o crachá é a liberação, não a
    // sessão. Reaproveitar uma sessão antiga faria o acesso de ontem
    // sobreviver ao encerramento de hoje.
    const captcha = await tokenCaptcha();
    const { error: eLogin } = await sb.auth.signInAnonymously(
      captcha ? { options: { captchaToken: captcha } } : undefined);
    if (eLogin) throw eLogin;

    const { data, error } = await sb.rpc("abrir_acervo", {
      p_codigo: el.codigo.value, p_nome: nome,
      p_crm: (el.crm.value || "").trim() || null,
    });
    if (error) throw error;
    const lib = Array.isArray(data) ? data[0] : data;
    if (!lib || !lib.paciente_id) throw new Error("CODIGO_INVALIDO");

    pacienteId = lib.paciente_id;
    el.topoMedico.textContent = "· " + nome;
    // "ate 00:00" e literalmente correto e confunde: o prazo e a meia-noite
    // SEGUINTE, e o numero lido de relance parece dizer que ja venceu. A
    // frase do proprio termo — "termina no mesmo dia" — nao tem esse risco.
    el.prazo.textContent = "🔓 acesso liberado até o fim do dia";
    el.entrada.classList.add("escondido");
    el.acervo.classList.remove("escondido");
    await carregar();
  } catch (e) {
    const msg = String(e?.message || e);
    erro(msg.includes("CODIGO_INVALIDO")
      ? "Código não encontrado, já usado ou vencido. Peça ao paciente para "
        + "gerar um novo — eles valem poucos minutos."
      : "Não consegui abrir agora. Confira a conexão e tente de novo.");
    el.abrir.disabled = false;
    el.abrir.textContent = "Abrir acervo";
  }
};

el.sair.onclick = async () => {
  // Encerrar aqui é sair DESTE aparelho. Não revoga a liberação — quem
  // revoga é o dono do acervo, na tela dele. Dizer o contrário seria
  // prometer ao médico um poder que ele não tem.
  await sb.auth.signOut();
  location.reload();
};

function horaBR(iso) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR",
      { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch (e) { return "o fim do dia"; }
}

function dataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "";
}

/* ── O acervo ─────────────────────────────────────────────────────────── */
async function carregar() {
  el.grade.innerHTML = '<div class="carregando">Carregando os documentos…</div>';
  const { data, error } = await sb.from("documentos")
    .select("id, tipo, nome, data_documento, criado_em, documento_paginas(storage_path, ordem)")
    .eq("paciente_id", pacienteId)
    .order("data_documento", { ascending: false, nullsFirst: false });
  if (error) {
    el.grade.innerHTML = '<div class="vazio"><div class="icone">⚠️</div>'
      + "<p>Não consegui ler o acervo. O acesso pode ter sido encerrado pelo paciente.</p></div>";
    return;
  }
  documentos = data || [];
  desenhar();
}

function termosDaBusca() {
  return semAcento(el.busca.value).split(/\s+/).filter(Boolean);
}

function casaBusca(d, termos) {
  if (!termos.length) return true;
  const texto = semAcento([d.nome || "", ROTULOS[d.tipo] || "",
                           dataBR(d.data_documento || d.criado_em),
                           String(d.data_documento || d.criado_em).slice(0, 10)].join(" "));
  return termos.every((t) => texto.includes(t));
}

function desenhar() {
  const termos = termosDaBusca();
  pintarCorpo();
  const lista = documentos.filter((d) =>
    casaBusca(d, termos)
    && (!regiaoAtiva || regioesDoDocumento(d).has(regiaoAtiva)));

  el.contaDocs.innerHTML = documentos.length
    ? `<b>${lista.length}</b> de ${documentos.length} documento`
      + `${documentos.length > 1 ? "s" : ""}`
      + (regiaoAtiva || termos.length ? " · filtrando" : "")
    : "";

  if (!lista.length) {
    el.grade.innerHTML = '<div class="vazio"><div class="icone">'
      + (documentos.length ? "🔎" : "🗂️") + "</div><p>"
      + (documentos.length ? "Nenhum documento com esse filtro."
                           : "Este paciente ainda não guardou documentos.")
      + "</p></div>";
    return;
  }

  el.grade.innerHTML = "";
  for (const d of lista) {
    const paginas = (d.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
    const b = document.createElement("button");
    b.className = "doc";
    b.innerHTML = `
      <div class="capa">${ICONES[d.tipo] || "📎"}</div>
      <div class="txt">
        <div class="nome">${d.nome || ROTULOS[d.tipo]}</div>
        <div class="meta">${ROTULOS[d.tipo]} · ${dataBR(d.data_documento || d.criado_em)}</div>
        ${paginas.length > 1 ? `<div class="paginas">${paginas.length} páginas</div>` : ""}
      </div>`;
    b.onclick = () => abrirDocumento(d, paginas);
    el.grade.appendChild(b);
    // A miniatura vem por URL assinada, uma por documento: o bucket é
    // privado, e a política só deixa passar enquanto a liberação vive.
    if (paginas[0]) {
      sb.storage.from("documentos").createSignedUrl(paginas[0].storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) {
            b.querySelector(".capa").innerHTML = `<img src="${data.signedUrl}" alt="">`;
          }
        });
    }
  }
}

/* ── O boneco ─────────────────────────────────────────────────────────── */
function pintarCorpo() {
  const conta = {};
  for (const d of documentos) {
    for (const id of regioesDoDocumento(d)) conta[id] = (conta[id] || 0) + 1;
  }
  el.corpoBloco.classList.toggle("escondido", !REGIOES.some((r) => conta[r.id]));

  for (const r of REGIOES.filter((x) => x.corpo)) {
    const alvo = el.corpo.querySelector(`[data-regiao="${r.id}"]`);
    if (!alvo) continue;
    const tem = !!conta[r.id];
    alvo.classList.toggle("tem", tem);
    alvo.classList.toggle("ativa", regiaoAtiva === r.id);
    alvo.setAttribute("tabindex", tem ? "0" : "-1");
    alvo.setAttribute("aria-pressed", regiaoAtiva === r.id ? "true" : "false");
  }

  el.folhinhas.innerHTML = "";
  for (const r of REGIOES.filter((x) => !x.corpo && conta[x.id])) {
    const b = document.createElement("button");
    b.className = "folhinha" + (regiaoAtiva === r.id ? " ativa" : "");
    b.dataset.regiao = r.id;
    b.innerHTML = `<span>${r.icone}</span><span>${r.rotulo}</span>`
                + `<span class="n">${conta[r.id]}</span>`;
    b.onclick = () => alternarRegiao(r.id);
    el.folhinhas.appendChild(b);
  }

  const atual = REGIOES.find((r) => r.id === regiaoAtiva);
  el.corpoDica.textContent = atual ? "Mostrando: " + atual.rotulo : "Por parte do corpo";
  el.verTodos.classList.toggle("escondido", !regiaoAtiva);
}

function alternarRegiao(id) {
  regiaoAtiva = regiaoAtiva === id ? null : id;
  desenhar();
}

el.corpo.addEventListener("click", (e) => {
  const alvo = e.target.closest(".regiao.tem");
  if (alvo) alternarRegiao(alvo.dataset.regiao);
});
el.corpo.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const alvo = e.target.closest(".regiao.tem");
  if (alvo) { e.preventDefault(); alternarRegiao(alvo.dataset.regiao); }
});
el.verTodos.onclick = () => { regiaoAtiva = null; desenhar(); };
el.busca.oninput = desenhar;

/* ── Ver o documento ──────────────────────────────────────────────────── */
let visuPaginas = [], visuIndice = 0;

async function abrirDocumento(doc, paginas) {
  if (!paginas.length) return;
  el.visuTitulo.textContent = (doc.nome || ROTULOS[doc.tipo])
    + " · " + dataBR(doc.data_documento || doc.criado_em);
  el.visuImg.removeAttribute("src");
  el.telaVisu.classList.remove("escondido");
  const { data } = await sb.storage.from("documentos")
    .createSignedUrls(paginas.map((p) => p.storage_path), 3600);
  visuPaginas = (data || []).map((d) => d.signedUrl).filter(Boolean);
  if (!visuPaginas.length) {
    el.telaVisu.classList.add("escondido");
    alert("Não consegui abrir a imagem. O acesso pode ter sido encerrado.");
    return;
  }
  visuIndice = 0;
  mostrarPagina();
}

function mostrarPagina() {
  el.visuImg.src = visuPaginas[visuIndice];
  el.visuConta.textContent = `${visuIndice + 1} / ${visuPaginas.length}`;
  el.visuAntes.disabled = visuIndice === 0;
  el.visuDepois.disabled = visuIndice === visuPaginas.length - 1;
}

el.visuAntes.onclick = () => { if (visuIndice > 0) { visuIndice--; mostrarPagina(); } };
el.visuDepois.onclick = () => {
  if (visuIndice < visuPaginas.length - 1) { visuIndice++; mostrarPagina(); }
};
el.visuFechar.onclick = () => {
  el.telaVisu.classList.add("escondido");
  el.visuImg.removeAttribute("src");
  visuPaginas = [];
};
// Setas do teclado: no consultório o médico está no computador, e virar
// página com o mouse a cada folha de um laudo de seis é atrito à toa.
document.addEventListener("keydown", (e) => {
  if (el.telaVisu.classList.contains("escondido")) return;
  if (e.key === "ArrowLeft") el.visuAntes.click();
  if (e.key === "ArrowRight") el.visuDepois.click();
  if (e.key === "Escape") el.visuFechar.click();
});

el.codigo.focus();
