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

/* `storageKey` PRÓPRIO, e sessão que não se grava. Não é detalhe: sem isto,
   esta página APAGA A CONTA DO PACIENTE.

   As duas páginas moram na mesma origem, e o cliente padrão guarda a sessão
   em `localStorage` sob uma chave derivada só do projeto. Quando o médico
   toca em "Abrir acervo", o `signInAnonymously` daqui sobrescreve a sessão
   do dono do acervo — que é anônima e, sem e-mail vinculado, NÃO VOLTA. O
   paciente reabre o aplicativo e encontra uma conta nova e vazia, com os
   documentos dele intactos no servidor e inalcançáveis para sempre.

   Foi o que aconteceu no primeiro teste real desta página, em 17/09/2026.

   `persistSession: false` fecha a porta de vez: a sessão do médico vive só
   na memória desta aba e morre com ela — o que também é o certo para um
   acesso que termina no fim do dia. */
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { storageKey: "sb-medico", persistSession: false,
          autoRefreshToken: false },
});
const $ = (id) => document.getElementById(id);

const el = {
  entrada: $("tela-entrada"), acervo: $("tela-acervo"),
  codigo: $("codigo"), nome: $("nome"), crm: $("crm"),
  abrir: $("abrir"), erroEntrada: $("erro-entrada"),
  topoMedico: $("topo-medico"), topoPaciente: $("topo-paciente"),
  prazo: $("prazo"), sair: $("sair"),
  busca: $("busca"), filtroTipo: $("filtro-tipo"), filtroOrdem: $("filtro-ordem"),
  corpoBloco: $("corpo-bloco"), corpo: $("corpo"),
  corpoDica: $("corpo-dica"), folhinhas: $("folhinhas"), verTodos: $("ver-todos"),
  subs: $("subs"),
  contaDocs: $("conta-docs"), grade: $("grade"),
  modoGrade: $("modo-grade"), modoLista: $("modo-lista"),
  telaVisu: $("tela-visu"), visuImg: $("visu-img"), visuTitulo: $("visu-titulo"),
  visuConta: $("visu-conta"), visuAntes: $("visu-antes"),
  visuMenos: $("visu-menos"), visuMais: $("visu-mais"), visuZoom: $("visu-zoom"),
  visuDepois: $("visu-depois"), visuFechar: $("visu-fechar"),
  visuImprimir: $("visu-imprimir"),
  anotar: $("anotar"), anotarNome: $("anotar-nome"), anotarData: $("anotar-data"),
  anotarTexto: $("anotar-texto"), anotarEnviar: $("anotar-enviar"),
  anotarEstado: $("anotar-estado"),
};

let documentos = [];
let medicoNome = "";

// Meses → "8 meses", "1 ano e 3 meses", "54 anos". Até dois anos os meses
// mudam a leitura do exame; depois disso são ruído.
function textoIdade(meses) {
  if (meses === null || meses === undefined || meses < 0) return "";
  if (meses < 12) return meses + (meses === 1 ? " mês" : " meses");
  const anos = Math.floor(meses / 12), resto = meses % 12;
  const a = anos + (anos === 1 ? " ano" : " anos");
  if (anos >= 2 || !resto) return a;
  return a + " e " + resto + (resto === 1 ? " mês" : " meses");
}
let regiaoAtiva = null;
// O refino dentro da regiao. Apaga-se junto com ela, sempre.
let subAtivo = null;
let pacienteId = null;
// A PESSOA liberada, que e o que este acervo mostra. Uma conta pode
// guardar mais de um acervo — a mae e o filho —, e o codigo de seis
// digitos libera UM deles. Filtrar por conta aqui entregaria os dois, e
// o termo promete o contrario.
let pessoaId = null;
/* Guardado entre pacientes, de proposito: quem prefere lista prefere sempre,
   e faze-lo escolher de novo a cada codigo digitado seria cobrar duas vezes
   pela mesma decisao. Nao e sessao — e so o jeito de olhar. */
let modo = (() => {
  // LISTA por padrao, e nao grade. A grade mostra a capa grande, que serve
  // para RECONHECER um papel pela aparencia — util para o paciente, que
  // fotografou aquilo. O medico procura pelo NOME do exame, e em lista cabe
  // o dobro de linhas na mesma altura de tela. Quem preferir a grade toca
  // uma vez e a escolha fica guardada.
  // O `catch` cai no MESMO padrao, e nao no antigo: navegador anonimo e
  // armazenamento bloqueado nao sao motivo para a tela abrir diferente.
  try { return localStorage.getItem("medico-modo") === "grade" ? "grade" : "lista"; }
  catch (e) { return "lista"; }
})();

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

// Aberta pela aba 📱 indiDoc do prontuário do Indiclin, a página recebe nome
// e CRM na URL: o médico só digita o código. Continuam editáveis, e entram
// por .value (nunca como HTML) — a URL é de quem a montou, não confiável.
//
// Etapa 2 da integração, também pela URL:
//   oc, om, cn  clínica e médico no Indiclin, e o nome da clínica. Vão para
//               abrir_acervo, que marca o acesso como vindo do Indiclin — é
//               o que permite ao paciente responder "manter liberado".
//               Forjá-los não dá nada: usar a autorização exige a senha da
//               integração, que só o servidor do Indiclin tem.
//   acesso      a senha de 32 dígitos emitida pela autorização do paciente.
//               Com ela a página abre sozinha, sem código.
//   po          a origem da página do Indiclin, para avisá-la (postMessage)
//               de quem é o acervo aberto. Só para ela, nunca para "*".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let origemIndiclin = null;
let senhaAcesso = null;
try {
  const q = new URLSearchParams(location.search);
  if (q.get("nome")) el.nome.value = q.get("nome").slice(0, 120);
  if (q.get("crm")) el.crm.value = q.get("crm").slice(0, 30);
  if (q.get("nome")) el.codigo.focus();
  if (UUID_RE.test(q.get("oc") || "") && UUID_RE.test(q.get("om") || "")) {
    let po = null;
    try { po = q.get("po") ? new URL(q.get("po")).origin : null; } catch (e) { po = null; }
    origemIndiclin = { clinica: q.get("oc"), medico: q.get("om"),
                       clinicaNome: (q.get("cn") || "").slice(0, 120), po };
  }
  if (/^\d{32}$/.test(q.get("acesso") || "")) senhaAcesso = q.get("acesso");
} catch (e) { /* URL estranha: segue com os campos vazios */ }

// Conta à página do Indiclin de quem é o acervo aberto: é com isso que ela
// oferece ao médico vincular este acervo ao paciente do prontuário. Só
// quando veio do Indiclin, e só para a origem que ele declarou.
function avisarIndiclin(via) {
  if (!origemIndiclin || !origemIndiclin.po || window.parent === window) return;
  try {
    window.parent.postMessage({
      tipo: "indidoc-aberto", via,
      pessoa_id: pessoaId,
      nome: el.topoPaciente.textContent || "",
    }, origemIndiclin.po);
  } catch (e) { /* sem o aviso, só não oferece o vínculo */ }
}

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
  // Uso único: a senha sai daqui antes de qualquer chamada. Se a abertura
  // falhar em qualquer ponto, o próximo clique usa o código digitado.
  const senhaUsada = senhaAcesso;
  senhaAcesso = null;
  try {
    // Sessão anônima nova a cada abertura: o crachá é a liberação, não a
    // sessão. Reaproveitar uma sessão antiga faria o acesso de ontem
    // sobreviver ao encerramento de hoje.
    const captcha = await tokenCaptcha();
    const { error: eLogin } = await sb.auth.signInAnonymously(
      captcha ? { options: { captchaToken: captcha } } : undefined);
    if (eLogin) throw eLogin;

    const via = senhaUsada ? "autorizacao" : "codigo";
    const { data, error } = await sb.rpc("abrir_acervo", {
      p_codigo: senhaUsada || el.codigo.value, p_nome: nome,
      p_crm: (el.crm.value || "").trim() || null,
      p_origem_clinica: origemIndiclin ? origemIndiclin.clinica : null,
      p_origem_medico: origemIndiclin ? origemIndiclin.medico : null,
      p_clinica_nome: origemIndiclin ? origemIndiclin.clinicaNome || null : null,
    });
    if (error) throw error;
    const lib = Array.isArray(data) ? data[0] : data;
    if (!lib || !lib.paciente_id) throw new Error("CODIGO_INVALIDO");

    pacienteId = lib.paciente_id;
    pessoaId = lib.pessoa_id || null;
    medicoNome = nome;
    el.topoMedico.textContent = "· " + nome;
    /* O NOME DO PACIENTE. Vem por funcao (`nome_do_paciente`, sql/008) e
       nao por leitura da tabela: RLS e por linha, e uma politica de select
       em `pacientes_app` entregaria telefone, nascimento e aceite do termo
       junto. O paciente consentiu em mostrar DOCUMENTOS.

       Falhando ou vindo vazio, a tela fica como era. Nao ha aviso: nome em
       branco e o estado normal de quem ainda nao preencheu, e alarme sobre
       isso, na frente do paciente, so atrapalharia a consulta. */
    try {
      // O nome da PESSOA liberada, e nao o do dono da conta: numa consulta
      // do filho a tela tem de dizer o nome DELE. O atalho antigo fica para
      // um codigo gerado antes desta versao, que nao carrega pessoa.
      const { data: nomePac } = pessoaId
        ? await sb.rpc("nome_da_pessoa", { p_pessoa: pessoaId })
        : await sb.rpc("nome_do_paciente", { p_paciente: pacienteId });
      const limpo = String(nomePac || "").trim();
      if (limpo) el.topoPaciente.textContent = limpo;
    } catch (e) {
      console.warn("[nome]", e?.message || e);
    }
    /* A IDADE (sql/010). Só a idade, nunca a data — mesmo motivo do nome.
       Vem em meses porque abaixo de dois anos é assim que se conta. Sem
       data preenchida, ou num banco sem o 010, a tela segue só com o nome. */
    try {
      const { data: meses, error: eIdade } = pessoaId
        ? await sb.rpc("idade_da_pessoa", { p_pessoa: pessoaId })
        : await sb.rpc("idade_do_paciente", { p_paciente: pacienteId });
      if (eIdade) throw eIdade;
      const idade = textoIdade(meses);
      if (idade) {
        const base = el.topoPaciente.textContent;
        el.topoPaciente.textContent = base === "Acervo do paciente"
          ? "Paciente de " + idade : base + ", " + idade;
      }
    } catch (e) {
      console.warn("[idade]", e?.message || e);
    }
    // "ate 00:00" e literalmente correto e confunde: o prazo e a meia-noite
    // SEGUINTE, e o numero lido de relance parece dizer que ja venceu. A
    // frase do proprio termo — "termina no mesmo dia" — nao tem esse risco.
    el.prazo.textContent = "🔓 acesso liberado até o fim do dia";
    el.entrada.classList.add("escondido");
    el.acervo.classList.remove("escondido");
    avisarIndiclin(via);
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

// Senha de autorização na URL: abre sozinha. Falhou (vencida, revogada no
// meio do caminho), cai na tela do código com o motivo — o médico pede o
// código ao paciente como sempre.
if (senhaAcesso) {
  el.abrir.disabled = false;
  el.abrir.onclick().then(() => {
    if (!el.entrada.classList.contains("escondido")) {
      erro("O acesso sem código não valeu agora. Peça ao paciente o código "
         + "de 6 dígitos.");
    }
  });
}

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

// dataBR vive em comum.js. Aqui o vazio e "" e nao "sem data": na lista do
// paciente a ausencia de data merece ser dita; na do medico, que ja e
// densa, ela so somaria ruido em toda linha antiga.
const dataBRmed = (iso) => dataBR(iso, "");

/* ── O acervo ─────────────────────────────────────────────────────────── */
async function carregar() {
  el.grade.innerHTML = '<div class="carregando">Carregando os documentos…</div>';
  const { data, error } = await sb.from("documentos")
    .select("id, tipo, nome, data_documento, criado_em, documento_paginas(storage_path, ordem)")
    // Por PESSOA. O RLS ja recusaria as linhas das outras (ver
    // tem_liberacao_pessoa, sql/009), mas pedir so o que se pode ver e o
    // desenho certo: a politica e a ultima trava, nao a primeira.
    .eq("pessoa_id", pessoaId)
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
                           dataBRmed(d.data_documento || d.criado_em),
                           diaDoDocumento(d)].join(" "));
  return termos.every((t) => texto.includes(t));
}

function trocarModo(novo) {
  modo = novo;
  try { localStorage.setItem("medico-modo", novo); } catch (e) { /* ignora */ }
  desenhar();
}
el.modoGrade.onclick = () => trocarModo("grade");
el.modoLista.onclick = () => trocarModo("lista");

function desenhar() {
  const termos = termosDaBusca();
  el.grade.className = modo;
  el.modoGrade.setAttribute("aria-pressed", modo === "grade" ? "true" : "false");
  el.modoLista.setAttribute("aria-pressed", modo === "lista" ? "true" : "false");
  const tipo = el.filtroTipo.value;
  const ordem = el.filtroOrdem.value;
  pintarCorpo();
  const lista = documentos.filter((d) =>
    (!tipo || d.tipo === tipo)
    && casaBusca(d, termos)
    && (!regiaoAtiva || regioesDoDocumento(d).has(regiaoAtiva))
    && (!subAtivo || noSubAssunto(d, regiaoAtiva, subAtivo)));

  // A data do DOCUMENTO manda, e a de guardado e so o desempate: o medico
  // pensa em "o exame de fevereiro", nao em "o que ela fotografou terca".
  const quando = (d) => d.data_documento || d.criado_em;
  if (ordem === "antigo") {
    lista.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
  } else if (ordem === "tipo") {
    // Esta ordenacao sobrevive para o caso de a lista nao ser agrupada;
    // quem desenha o modo "tipo" e `desenharPorTipo`, que reordena dentro
    // de cada faixa.
    lista.sort((a, b) => a.tipo.localeCompare(b.tipo)
      || String(quando(b)).localeCompare(String(quando(a))));
  } else {
    lista.sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));
  }

  el.contaDocs.innerHTML = documentos.length
    ? `<b>${lista.length}</b> de ${documentos.length} documento`
      + `${documentos.length > 1 ? "s" : ""}`
      + (regiaoAtiva || tipo || termos.length ? " · filtrando" : "")
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
  if (ordem === "exame") return desenharAgrupado(lista);
  if (ordem === "tipo") return desenharPorTipo(lista);
  for (const d of lista) el.grade.appendChild(cartaoDocumento(d));
}

/* Um documento na tela. Extraído para ser usado duas vezes: solto na lista
   e dentro de um grupo. */
function cartaoDocumento(d) {
  const paginas = (d.documento_paginas || []).slice().sort((a, b) => a.ordem - b.ordem);
  const b = document.createElement("button");
  b.className = "doc";
  b.innerHTML = `
    <div class="capa">${ICONES[d.tipo] || "📎"}</div>
    <div class="txt">
      <div class="nome">${escaparHTML(d.nome || ROTULOS[d.tipo])}</div>
      <div class="meta">${ROTULOS[d.tipo]} · ${dataBRmed(d.data_documento || d.criado_em)}</div>
      ${paginas.length > 1 ? `<div class="paginas">${paginas.length} páginas</div>` : ""}
    </div>`;
  b.onclick = () => abrirDocumento(d, paginas);
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
  return b;
}

/* ── Agrupados por tipo ───────────────────────────────────────────────────
   Este modo dizia "agrupados" e só ORDENAVA: um `sort` por tipo, sem
   cabeçalho, sem contagem, sem separação nenhuma. O rótulo prometia uma
   coisa e entregava outra — e ficou mais visível depois que "Agrupados por
   exame" passou a agrupar de verdade logo ao lado.

   POR QUE FAIXA E NÃO GRUPO QUE ABRE E FECHA. São duas coisas diferentes e
   a aparência tem de dizer isso:

     por exame   dezenas de grupos pequenos → cartão com seta, fechado, o
                 médico abre o que interessa
     por tipo    quatro ou cinco grupos grandes → faixa de título, sempre
                 aberta; fechar todos esconderia o acervo inteiro atrás de
                 cinco linhas

   Uma seta que não abre nada seria pior que a ordenação muda de antes.

   A ORDEM É A DO SELETOR DE TIPO, não alfabética: exame, laudo, receita,
   relatório, outro. Os dois controles falam dos mesmos cinco nomes, e
   apresentá-los em ordens diferentes faria o médico procurar duas vezes.

   ISTO NÃO DUPLICA O FILTRO DE TIPO. O filtro mostra UM tipo e esconde o
   resto; aqui aparecem TODOS, organizados e contados. É a diferença entre
   "só os laudos" e "o que este paciente tem, por espécie de papel". */
function desenharPorTipo(lista) {
  const ORDEM_TIPOS = ["exame", "laudo", "receita", "relatorio", "outro"];
  const porTipo = new Map();
  for (const d of lista) {
    if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, []);
    porTipo.get(d.tipo).push(d);
  }
  // Tipo que o banco tenha e a lista não conheça entra no fim, em vez de
  // sumir: documento invisível é pior que documento fora de ordem.
  const tipos = [...porTipo.keys()].sort((a, b) => {
    const ia = ORDEM_TIPOS.indexOf(a), ib = ORDEM_TIPOS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  for (const t of tipos) {
    const docs = porTipo.get(t).sort((a, b) =>
      String(b.data_documento || b.criado_em)
        .localeCompare(String(a.data_documento || a.criado_em)));
    const faixa = document.createElement("div");
    faixa.className = "secao";
    const rotulo = ROTULOS[t] || t;
    faixa.innerHTML = `<span class="secao-nome">${rotulo}${docs.length > 1 ? "s" : ""}</span>`
                    + `<span class="secao-n">${docs.length}</span>`;
    el.grade.appendChild(faixa);

    const caixa = document.createElement("div");
    // `secao-docs`, e nao `grupo-docs`: o recuo e a barra da esquerda dizem
    // "isto esta DENTRO daquilo", que e verdade num grupo que abre e fecha
    // e nao numa faixa de titulo.
    caixa.className = "secao-docs " + modo;
    for (const d of docs) caixa.appendChild(cartaoDocumento(d));
    el.grade.appendChild(caixa);
  }
}

/* ── Agrupados por exame ──────────────────────────────────────────────────
   Uma linha por exame, não por data. Existe porque a pergunta do médico
   quase nunca é "o que ele fez em agosto" — é "como está a hemoglobina
   dele ao longo do tempo". Comparar o mesmo exame no tempo é o que nenhum
   aparelho faz, porque cada um enxerga um exame só.

   Ordenado por DATA, os cinco hemogramas de um paciente caem nas posições
   1, 4, 6, 7 e 8, intercalados com TSH e ecocardiograma, e nada na tela
   diz que são o mesmo exame. Medido na página, com acervo de teste.

   POR QUE O AGRUPAMENTO É POR NOME EXATO (depois de tirar acento, caixa e
   espaço a mais) e NÃO por "um nome contido no outro", que era o plano:

     "ULTRASSOM"            engoliria
     "ULTRASSOM DE PELE"    e
     "ULTRASSOM DE ABDOME"

   Um exame de pele escondido dentro do grupo do abdome é pior do que dois
   grupos parecidos lado a lado: o médico não vê o que não sabe que existe.
   O mesmo vale para "RAIO-X" e "TOMOGRAFIA", que são famílias, não exames.

   O custo desta escolha: quem escreveu "HEMOGRAMA" numa vez e "HEMOGRAMA
   COMPLETO" noutra fica com dois grupos. A ordenação ALFABÉTICA resolve na
   prática — os dois ficam vizinhos, visíveis, e é o médico quem decide se
   são a mesma coisa. Adjacência em vez de fusão.

   Os grupos ficam FECHADOS. Abrir todos devolveria a lista de antes, que é
   o que este modo existe para encurtar. */

// Quais grupos o médico abriu. Fora de `desenhar` para sobreviver aos
// redesenhos: filtrar por tipo não pode fechar o que ele acabou de abrir.
let gruposAbertos = new Set();

// chaveDoExame, agruparPorExame e anoDe vivem em comum.js: o aplicativo do
// paciente agrupa pelas MESMAS regras, e duas copias divergiriam em
// silencio — foi por isso que a tabela de palavras foi para la primeiro.

function desenharAgrupado(lista) {
  for (const g of agruparPorExame(lista)) {
    // Grupo de um não é grupo: vira o cartão de sempre, sem seta para
    // abrir e sem "1 exame", que só somariam ruído.
    if (g.docs.length === 1) { el.grade.appendChild(cartaoDocumento(g.docs[0])); continue; }

    const aberto = gruposAbertos.has(g.chave);

    const cab = document.createElement("button");
    cab.className = "grupo" + (aberto ? " aberto" : "");
    cab.setAttribute("aria-expanded", aberto ? "true" : "false");
    cab.innerHTML = `
      <span class="grupo-seta" aria-hidden="true">▸</span>
      <span class="capa">${ICONES[g.docs[0].tipo] || "📎"}</span>
      <span class="txt">
        <span class="nome">${escaparHTML(g.nome)}</span>
        <span class="meta">${resumoDoGrupo(g)}</span>
      </span>`;
    el.grade.appendChild(cab);

    const caixa = document.createElement("div");
    // A classe é o modo escolhido: dentro do grupo o médico continua
    // podendo ver em grade ou em lista, como no resto da página.
    caixa.className = "grupo-docs " + modo + (aberto ? "" : " escondido");
    for (const d of g.docs) caixa.appendChild(cartaoDocumento(d));
    el.grade.appendChild(caixa);

    cab.onclick = () => {
      const agora = !gruposAbertos.has(g.chave);
      if (agora) gruposAbertos.add(g.chave); else gruposAbertos.delete(g.chave);
      cab.classList.toggle("aberto", agora);
      cab.setAttribute("aria-expanded", agora ? "true" : "false");
      caixa.classList.toggle("escondido", !agora);
    };
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
    // querySelectorAll, nao querySelector: "membros" sao TRES elementos
    // (duas pernas juntas e cada braco), e pintar so o primeiro deixaria os
    // bracos apagados e mudos ao toque.
    const alvos = [...el.corpo.querySelectorAll(`[data-regiao="${r.id}"]`)];
    if (!alvos.length) continue;
    const tem = !!conta[r.id];
    for (const alvo of alvos) {
    alvo.classList.toggle("tem", tem);
    alvo.classList.toggle("ativa", regiaoAtiva === r.id);
    if (alvo.getAttribute("tabindex") !== "-1" || alvos.length === 1) {
      alvo.setAttribute("tabindex", tem ? "0" : "-1");
    }
    alvo.setAttribute("aria-pressed", regiaoAtiva === r.id ? "true" : "false");
    }
  }

  // O mesmo número que o paciente vê no boneco dele.
  pintarBolhas(el.corpo, conta, regiaoAtiva);

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

  // Conta sobre o acervo INTEIRO, como o resto do boneco.
  const achados = regiaoAtiva ? subAssuntos(regiaoAtiva, documentos) : [];
  el.subs.classList.toggle("escondido", !achados.length);
  el.subs.innerHTML = "";
  if (!achados.length) { subAtivo = null; return; }
  if (subAtivo && !achados.some((a) => a.id === subAtivo)) subAtivo = null;
  const rot = document.createElement("span");
  rot.className = "subs-rot";
  rot.textContent = "Mostrar só:";
  el.subs.appendChild(rot);
  for (const a of achados) {
    const b = document.createElement("button");
    b.className = "sub" + (subAtivo === a.id ? " ativa" : "");
    b.setAttribute("aria-pressed", subAtivo === a.id ? "true" : "false");
    b.innerHTML = `<span>${a.rotulo}</span><span class="n">${a.n}</span>`;
    b.onclick = () => {
      subAtivo = subAtivo === a.id ? null : a.id;
      desenhar();
    };
    el.subs.appendChild(b);
  }
}

function alternarRegiao(id) {
  regiaoAtiva = regiaoAtiva === id ? null : id;
  subAtivo = null;
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
el.verTodos.onclick = () => { regiaoAtiva = null; subAtivo = null; desenhar(); };
el.busca.oninput = desenhar;
el.filtroTipo.onchange = desenhar;
el.filtroOrdem.onchange = desenhar;

/* ── Ver o documento ──────────────────────────────────────────────────── */
let visuPaginas = [], visuIndice = 0;

async function abrirDocumento(doc, paginas) {
  if (!paginas.length) return;
  prepararAnotacao(doc);
  el.visuTitulo.textContent = (doc.nome || ROTULOS[doc.tipo])
    + " · " + dataBRmed(doc.data_documento || doc.criado_em);
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

/* ── Zoom ──────────────────────────────────────────────────────────────
   Laudo fotografado tem letra miúda, e "caber na tela" num monitor de
   consultório deixa a folha ilegível. Níveis fixos, e não contínuos: o
   médico quer "maior", não 137%. 0 = ajustar à tela; os outros são a
   largura em relação à do palco. Clique na imagem amplia NAQUELE ponto;
   Ctrl + roda também; arrastar com o mouse anda pela folha. */
const NIVEIS_ZOOM = [0, 1.5, 2, 3, 4];
let nivelZoom = 0;
const palco = el.visuImg.parentElement;

function aplicarZoom(pontoX, pontoY) {
  const z = NIVEIS_ZOOM[nivelZoom];
  // O ponto (em fração da imagem) que deve continuar sob o cursor.
  const r = el.visuImg.getBoundingClientRect();
  const fx = pontoX == null ? 0.5 : (pontoX - r.left) / (r.width || 1);
  const fy = pontoY == null ? 0.5 : (pontoY - r.top) / (r.height || 1);
  palco.classList.toggle("ampliado", z > 0);
  el.visuImg.style.width = z > 0 ? Math.round(palco.clientWidth * z) + "px" : "";
  el.visuZoom.textContent = z > 0 ? Math.round(z * 100) + "%" : "ajustar";
  el.visuMenos.disabled = nivelZoom === 0;
  el.visuMais.disabled = nivelZoom === NIVEIS_ZOOM.length - 1;
  if (z > 0) {
    const alvoX = el.visuImg.offsetLeft + fx * el.visuImg.offsetWidth;
    const alvoY = el.visuImg.offsetTop + fy * el.visuImg.offsetHeight;
    const cx = pontoX == null ? palco.clientWidth / 2 : pontoX - palco.getBoundingClientRect().left;
    const cy = pontoY == null ? palco.clientHeight / 2 : pontoY - palco.getBoundingClientRect().top;
    palco.scrollLeft = alvoX - cx;
    palco.scrollTop = alvoY - cy;
  }
}

function mudarZoom(passo, x, y) {
  const novo = Math.min(NIVEIS_ZOOM.length - 1, Math.max(0, nivelZoom + passo));
  if (novo === nivelZoom) return;
  nivelZoom = novo;
  aplicarZoom(x, y);
}

el.visuMais.onclick = () => mudarZoom(1);
el.visuMenos.onclick = () => mudarZoom(-1);

// Clique: ajustada, amplia no ponto; ampliada, só volta se não foi arrasto.
let arrastou = false;
el.visuImg.addEventListener("click", (e) => {
  if (arrastou) { arrastou = false; return; }
  if (nivelZoom === 0) mudarZoom(2, e.clientX, e.clientY);
});
palco.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  mudarZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
}, { passive: false });

// Arrastar para andar pela folha ampliada.
let arrasto = null;
palco.addEventListener("mousedown", (e) => {
  if (nivelZoom === 0 || e.button !== 0) return;
  arrasto = { x: e.clientX, y: e.clientY, l: palco.scrollLeft, t: palco.scrollTop };
  arrastou = false;
  palco.classList.add("arrastando");
  e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
  if (!arrasto) return;
  const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) arrastou = true;
  palco.scrollLeft = arrasto.l - dx;
  palco.scrollTop = arrasto.t - dy;
});
window.addEventListener("mouseup", () => {
  arrasto = null;
  palco.classList.remove("arrastando");
});

function mostrarPagina() {
  // Página nova começa ajustada: o zoom da folha anterior, noutro ponto,
  // mostraria um pedaço aleatório desta.
  nivelZoom = 0;
  aplicarZoom();
  el.visuImg.src = visuPaginas[visuIndice];
  el.visuConta.textContent = `${visuIndice + 1} / ${visuPaginas.length}`;
  el.visuAntes.disabled = visuIndice === 0;
  el.visuDepois.disabled = visuIndice === visuPaginas.length - 1;
}

el.visuAntes.onclick = () => { if (visuIndice > 0) { visuIndice--; mostrarPagina(); } };
el.visuDepois.onclick = () => {
  if (visuIndice < visuPaginas.length - 1) { visuIndice++; mostrarPagina(); }
};
/* ── Imprimir ─────────────────────────────────────────────────────────
   Permitir, e nao fingir que da para impedir: quem esta com a tela aberta
   tira uma captura em dois segundos. E guardar o exame no prontuario e
   pratica clinica normal — as vezes obrigacao: o que informou a decisao
   precisa estar registrado.

   O que a impressao NAO pode ser e uma folha anonima. Um exame solto num
   prontuario, sem dizer de onde veio, e pior que nenhum: ninguem sabe se
   foi conferido, quem autorizou, nem quando. Dai o rodape — ele e a razao
   deste codigo existir em vez de um simples Ctrl+P, que sairia com a
   interface inteira e sem procedencia. */
/* O que sai na folha, separado de quem manda imprimir. A separacao existe
   para poder VERIFICAR o resultado sem abrir a caixa de impressao — e o
   rodape e justamente a parte que precisa ser verificada. */
function montarImpressao(titulo, urls, medico, hoje) {
  const paginas = urls.map((u) => `<div class="folha">`
    + `<img src="${u}" alt="">`
    + `<div class="rodape">${titulo} · impresso em ${hoje}`
    + `<br>Acervo pessoal do paciente · acesso autorizado por código`
    + `${medico ? " a " + medico : ""}</div></div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { margin:0; font:12px/1.4 Arial, sans-serif; color:#111 }
      .folha { page-break-after: always; display:flex; flex-direction:column;
               height:277mm; }
      .folha:last-child { page-break-after: auto }
      /* A imagem ocupa a folha inteira menos o rodape, sem distorcer: o
         medico vai LER o exame nesta folha, e letra esticada nao se le. */
      img { flex:1; min-height:0; object-fit:contain; width:100% }
      .rodape { margin-top:6mm; padding-top:2mm; border-top:1px solid #bbb;
                font-size:10px; color:#555; line-height:1.5 }
    </style></head><body>${paginas}</body></html>`;
}

function imprimirDocumento() {
  if (!visuPaginas.length) return;
  const html = montarImpressao(el.visuTitulo.textContent || "Documento",
    visuPaginas, medicoNome, new Date().toLocaleDateString("pt-BR"));

  const quadro = document.createElement("iframe");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(quadro);
  const d = quadro.contentWindow.document;
  d.open();
  d.write(html);
  d.close();

  // Esperar as imagens: mandar imprimir antes faz sair folha em branco, e
  // quem descobre e o medico na frente da impressora.
  const imgs = [...d.images];
  let faltam = imgs.length;
  const vai = () => {
    quadro.contentWindow.focus();
    quadro.contentWindow.print();
    setTimeout(() => quadro.remove(), 1500);
  };
  if (!faltam) return vai();
  imgs.forEach((i) => {
    const conta = () => { if (--faltam === 0) vai(); };
    if (i.complete) conta();
    else { i.onload = conta; i.onerror = conta; }
  });
}
el.visuImprimir.onclick = imprimirDocumento;

/* ── Anotar no prontuário (integração Indiclin, etapa 3) ────────────────
   Em vez de anexar a imagem, o médico escreve o resultado que interessa e
   ele entra como UMA linha no prontuário da consulta — é o que os médicos
   já faziam à mão no texto livre ("HOLTER FEV/26 4% ECT VENTRI"), agora
   com nome, data e procedência preenchidos.

   Quem escreve no prontuário é o Indiclin: esta página só manda o texto
   (postMessage, só para a origem declarada) e espera a resposta dele, que
   diz se entrou ou por que não. Aberta fora do Indiclin, o bloco nem
   aparece — não há prontuário do outro lado. */
let docAnotando = null;

function prepararAnotacao(doc) {
  docAnotando = doc;
  const doIndiclin = !!(origemIndiclin && origemIndiclin.po && pessoaId
                        && window.parent !== window);
  el.anotar.classList.toggle("escondido", !doIndiclin);
  if (!doIndiclin) return;
  el.anotarNome.value = doc.nome || ROTULOS[doc.tipo] || "";
  el.anotarData.value = (doc.data_documento || "").slice(0, 10);
  el.anotarTexto.value = "";
  el.anotarEstado.textContent = "";
  el.anotarEstado.classList.remove("erro");
  el.anotarEnviar.disabled = false;
}

el.anotarEnviar.onclick = () => {
  const texto = (el.anotarTexto.value || "").trim();
  if (!texto) {
    el.anotarEstado.textContent = "Escreva o resultado que interessa.";
    el.anotarEstado.classList.add("erro");
    el.anotarTexto.focus();
    return;
  }
  el.anotarEnviar.disabled = true;
  el.anotarEstado.classList.remove("erro");
  el.anotarEstado.textContent = "Enviando…";
  try {
    window.parent.postMessage({
      tipo: "indidoc-nota", pessoa_id: pessoaId,
      documento_id: docAnotando && docAnotando.id,
      nome: (el.anotarNome.value || "").trim().slice(0, 120),
      data: el.anotarData.value || "",
      texto: texto.slice(0, 1000),
    }, origemIndiclin.po);
  } catch (e) {
    el.anotarEstado.textContent = "Não consegui falar com o prontuário.";
    el.anotarEstado.classList.add("erro");
    el.anotarEnviar.disabled = false;
  }
};

// A resposta do Indiclin. Só da origem que o abriu.
window.addEventListener("message", (e) => {
  if (!origemIndiclin || e.origin !== origemIndiclin.po) return;
  const d = e.data || {};
  if (d.tipo !== "indidoc-nota-resposta") return;
  if (d.ok) {
    el.anotarEstado.textContent = "✓ Anotado no prontuário da consulta.";
    el.anotarTexto.value = "";
  } else {
    el.anotarEstado.textContent = d.erro || "Não entrou no prontuário.";
    el.anotarEstado.classList.add("erro");
  }
  el.anotarEnviar.disabled = false;
});

el.visuFechar.onclick = () => {
  el.telaVisu.classList.add("escondido");
  el.visuImg.removeAttribute("src");
  visuPaginas = [];
};
// Setas do teclado: no consultório o médico está no computador, e virar
// página com o mouse a cada folha de um laudo de seis é atrito à toa.
document.addEventListener("keydown", (e) => {
  if (el.telaVisu.classList.contains("escondido")) return;
  // Digitando a anotação, as setas movem o cursor e o Esc não fecha o
  // documento com o texto pela metade.
  if (e.target && e.target.closest && e.target.closest(".anotar")) return;
  if (e.key === "+" || e.key === "=") mudarZoom(1);
  if (e.key === "-") mudarZoom(-1);
  if (e.key === "ArrowLeft") el.visuAntes.click();
  if (e.key === "ArrowRight") el.visuDepois.click();
  if (e.key === "Escape") el.visuFechar.click();
  // Ctrl+P com o visualizador aberto imprime O DOCUMENTO, nao a pagina: a
  // pagina sairia com trilha, boneco e botoes, e sem o rodape que diz de
  // onde veio.
  if ((e.ctrlKey || e.metaKey) && e.key === "p") {
    e.preventDefault(); imprimirDocumento();
  }
});

el.codigo.focus();
