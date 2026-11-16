/* ═══════════════════════════════════════════════════════════════════════
   🎮 ENQUANTO ESPERA — jogos da sala de espera (16/11/2026, aprovado pelo
   usuário; sql/031). Objetivos: conhecer a clínica e os procedimentos que
   ela faz, dicas de saúde e bem-estar, e conhecer o próprio indiDoc.

     ❓ Quiz           5 perguntas: a clínica (do perfil público que o
                       Indiclin manda), procedimentos, saúde e o indiDoc
     🧠 Memória        pares "exame ↔ parte do corpo"
     ✅ Verdade ou mito 5 frases de saúde, sempre com a fonte
     🗺️ Missões        5 tarefas reais no indiDoc

   Estrelas e medalhas ficam NESTE celular (localStorage "jogos-v1") — sem
   ranking e sem dado de saúde. Ao indiDoc só vai a contagem (jogos_eventos:
   o jogo, as estrelas e por onde a pessoa chegou).

   Abre: botão 🎮 do Início (origem "app", ou "dia" em dia de consulta),
   ou pelo link curto ?j=<código da clínica>&o=<whatsapp|balcao|tv|totem>,
   SEM precisar de conta — o paciente na sala de espera joga antes de
   instalar. Funciona sem internet (o perfil da clínica fica guardado).

   Conteúdo: jogos_conteudo.js. O núcleo (window.JogosNucleo) é puro, para
   o teste (testes/testar_jogos.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const C = window.JOGOS_CONTEUDO;
  if (!C) return;

  // ── Núcleo puro ───────────────────────────────────────────────────────
  const norm = (t) => " " + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim() + " ";

  function casarProcedimento(nome) {
    const n = norm(nome);
    return C.PROCEDIMENTOS.find((p) => p.chaves.some((k) => n.includes(" " + k + " "))) || null;
  }

  function areasDoPerfil(perfil) {
    const areas = new Set(["geral"]);
    if (!perfil) return areas;
    const esp = (perfil.especialidades || []).map(norm).join(" ");
    for (const [k, a] of Object.entries(C.AREAS)) if (a.chaves.some((c) => esp.includes(c))) areas.add(k);
    for (const p of perfil.procedimentos || []) { const m = casarProcedimento(p); if (m) areas.add(m.area); }
    return areas;
  }

  function embaralhar(lista, rnd) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Pergunta com a certa em opcoes[0] → embaralhada, com o índice da certa.
  function montar(p, rnd) {
    const ordem = embaralhar(p.opcoes.map((t, i) => ({ t, i })), rnd);
    return { ...p, opcoes: ordem.map((o) => o.t), certa: ordem.findIndex((o) => o.i === (p.certa || 0)) };
  }

  const ESPECIALIDADES_COMUNS = ["Cardiologia", "Dermatologia", "Ginecologia", "Oftalmologia", "Ortopedia",
    "Otorrinolaringologia", "Pediatria", "Neurologia", "Endocrinologia", "Urologia", "Clínica Médica", "Odontologia"];

  function perguntasDaClinica(perfil, rnd) {
    if (!perfil || !perfil.nome) return [];
    const nome = perfil.nome, out = [];
    const casados = (perfil.procedimentos || []).map((p) => ({ raw: p, m: casarProcedimento(p) }));
    const daClinica = new Set(casados.filter((x) => x.m).map((x) => x.m.nome));
    const fora = C.PROCEDIMENTOS.filter((p) => !daClinica.has(p.nome) && p.area !== "geral");
    // a) qual destes a clínica faz
    const conhecidos = casados.filter((x) => x.m);
    if (conhecidos.length && fora.length >= 3) {
      const certo = embaralhar(conhecidos, rnd)[0].m;
      out.push({ tipo: "clinica", pergunta: `Qual destes exames ou procedimentos é feito aqui na ${nome}?`,
        opcoes: [certo.nome, ...embaralhar(fora, rnd).slice(0, 3).map((p) => p.nome)],
        explica: `${certo.nome}: ${certo.oque}` });
    }
    // b) para que serve um procedimento da clínica
    if (conhecidos.length) {
      const alvo = embaralhar(conhecidos, rnd)[0].m;
      const outros = embaralhar(C.PROCEDIMENTOS.filter((p) => p.nome !== alvo.nome && p.area !== alvo.area), rnd).slice(0, 3);
      out.push({ tipo: "clinica", pergunta: `A ${nome} faz ${alvo.nome}. Para que serve esse exame?`,
        opcoes: [alvo.oque, ...outros.map((p) => p.oque)], explica: alvo.oque });
    }
    // c) especialidade de um médico
    const meds = (perfil.medicos || []).filter((m) => m.nome && m.especialidade);
    if (meds.length) {
      const m = embaralhar(meds, rnd)[0];
      const outras = embaralhar(ESPECIALIDADES_COMUNS.filter((e) => norm(e) !== norm(m.especialidade)), rnd).slice(0, 3);
      out.push({ tipo: "clinica", pergunta: `Em qual especialidade ${m.nome} atende na ${nome}?`,
        opcoes: [m.especialidade, ...outras], explica: `${m.nome} atende em ${m.especialidade}.` });
    }
    // d) especialidades da clínica
    const esps = (perfil.especialidades || []).filter(Boolean);
    if (esps.length) {
      const certa = embaralhar(esps, rnd)[0];
      const outras = embaralhar(ESPECIALIDADES_COMUNS.filter((e) => !esps.some((x) => norm(x) === norm(e))), rnd).slice(0, 3);
      if (outras.length === 3) {
        out.push({ tipo: "clinica", pergunta: `Qual destas especialidades tem atendimento na ${nome}?`,
          opcoes: [certa, ...outras], explica: `A ${nome} atende: ${esps.join(", ")}.` });
      }
    }
    return embaralhar(out, rnd);
  }

  function perguntasDeSaude(areas, rnd) {
    const out = C.QUIZ.filter((q) => areas.has(q.area)).map((q) => ({ ...q, tipo: "saude" }));
    for (const p of C.PROCEDIMENTOS.filter((x) => areas.has(x.area) && x.area !== "geral")) {
      const outros = embaralhar(C.PROCEDIMENTOS.filter((x) => x.area !== p.area), rnd).slice(0, 3);
      out.push({ tipo: "procedimento", pergunta: `Para que serve: ${p.nome}?`, opcoes: [p.oque, ...outros.map((x) => x.oque)],
                 explica: p.oque });
    }
    return embaralhar(out, rnd);
  }

  function rodadaQuiz(perfil, rnd) {
    const areas = areasDoPerfil(perfil);
    const cli = perguntasDaClinica(perfil, rnd).slice(0, 2);
    const sau = perguntasDeSaude(areas, rnd);
    const ind = embaralhar(C.INDIDOC, rnd).slice(0, 1).map((q) => ({ ...q, tipo: "indidoc" }));
    const lista = [...cli, ...sau.slice(0, 5 - cli.length - ind.length), ...ind];
    return lista.map((q) => montar(q, rnd));
  }

  function rodadaMitos(perfil, rnd) {
    const areas = areasDoPerfil(perfil);
    const daArea = embaralhar(C.MITOS.filter((m) => areas.has(m.area) && m.area !== "geral"), rnd).slice(0, 2);
    const gerais = embaralhar(C.MITOS.filter((m) => m.area === "geral"), rnd);
    return [...daArea, ...gerais].slice(0, 5);
  }

  const ROTULO_AREA = { cardio: "❤️ Coração", oftalmo: "👁️ Olhos", otorrino: "👂 Ouvido e garganta",
    gineco: "🌸 Saúde da mulher", pediatria: "🧒 Bebês e crianças", odonto: "🦷 Dentes" };

  function paresMemoria(perfil, rnd) {
    const areas = areasDoPerfil(perfil);
    const ordemAreas = embaralhar(Object.keys(ROTULO_AREA), rnd).sort((a, b) => (areas.has(b) ? 1 : 0) - (areas.has(a) ? 1 : 0));
    const pares = [];
    for (const a of ordemAreas.slice(0, 4)) {
      const p = embaralhar(C.PROCEDIMENTOS.filter((x) => x.area === a), rnd)[0];
      if (p) pares.push({ id: a, exame: p.nome, parte: ROTULO_AREA[a], oque: p.oque });
    }
    return pares;
  }

  const MEDALHAS = {
    clinica: { icone: "🏥", nome: "Conhece a clínica", como: "Acerte 4 de 5 no quiz" },
    mitos:   { icone: "🕵️", nome: "Caçador de mitos", como: "Acerte as 5 de verdade ou mito" },
    memoria: { icone: "🧠", nome: "Memória boa", como: "Complete o jogo da memória" },
    indidoc: { icone: "🗺️", nome: "Explorador do indiDoc", como: "Complete as 5 missões" },
  };

  window.JogosNucleo = { norm, casarProcedimento, areasDoPerfil, perguntasDaClinica, perguntasDeSaude,
                         rodadaQuiz, rodadaMitos, paresMemoria, MEDALHAS, embaralhar };

  // ── Daqui para baixo: a tela (só no navegador) ────────────────────────
  if (typeof document === "undefined" || !document.getElementById("tela-jogos")) return;
  const q = (id) => document.getElementById(id);
  const tela = q("tela-jogos"), palco = q("jg-palco");
  const esc = (t) => (typeof escaparHTML === "function" ? escaparHTML(t) : String(t || ""));
  const CHAVE = "jogos-v1", CHAVE_PERFIL = "jogos-perfil";
  // As listas do app.js. Em try: com o app.js parado no meio (variável
  // declarada e não iniciada), até o `typeof` estoura, e os jogos não podem
  // depender do resto do app para abrir.
  const lista = (nome) => { try { const v = { compromissos, documentos }[nome]; return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  let origem = "app", perfil = null, codigo = "";

  const cliente = () => { try { return typeof sb !== "undefined" ? sb : null; } catch (e) { return null; } };

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch (e) { return {}; } }
  function gravar(d) { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) {} }
  function marcar(chave) { const d = ler(); d.feito = d.feito || {}; d.feito[chave] = 1; gravar(d); }

  function contar(jogo, estrelas) {
    try {
      if (!cliente() || !navigator.onLine) return;
      cliente().from("jogos_eventos").insert({ jogo, origem, clinica_id: (perfil && perfil.clinica_id) || null,
                                        estrelas: estrelas == null ? null : estrelas }).then(() => {}, () => {});
    } catch (e) { /* contar nunca atrapalha o jogo */ }
  }

  function ganharEstrelas(n) { const d = ler(); d.estrelas = (d.estrelas || 0) + n; gravar(d); pintarTopo(); }

  function ganharMedalha(id) {
    const d = ler(); d.medalhas = d.medalhas || {};
    if (d.medalhas[id]) return false;
    d.medalhas[id] = new Date().toISOString().slice(0, 10); gravar(d);
    contar("medalha", null);
    return true;
  }

  function pintarTopo() {
    const d = ler();
    q("jg-estrelas").textContent = "⭐ " + (d.estrelas || 0);
    q("jg-sub").textContent = perfil && perfil.nome ? perfil.nome : "Jogos e dicas de saúde";
  }

  // ── Perfil da clínica: ?j=código, ou a clínica dos compromissos/documentos
  async function carregarPerfil() {
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CHAVE_PERFIL) || "null"); } catch (e) {}
    let idClinica = "";
    if (!codigo) {
      const comps = lista("compromissos").filter((c) => c.origem_clinica_id && !c.apagado);
      const docs = lista("documentos").filter((d) => d.origem_clinica_id && !d.apagado);
      const hoje = typeof hojeISO === "function" ? hojeISO() : "";
      const deHoje = comps.find((c) => c.quando === hoje);
      idClinica = (deHoje || comps[0] || docs[0] || {}).origem_clinica_id || "";
    }
    if (guardado && ((codigo && guardado.codigo === codigo) || (!codigo && (!idClinica || guardado.clinica_id === idClinica)))) {
      perfil = guardado;
    }
    if ((!codigo && !idClinica) || !cliente() || !navigator.onLine) return;
    try {
      let consulta = cliente().from("clinicas_perfil").select("clinica_id, codigo, nome, cidade, especialidades, medicos, procedimentos");
      consulta = codigo ? consulta.eq("codigo", codigo) : consulta.eq("clinica_id", idClinica);
      const { data } = await consulta.limit(1);
      if (data && data[0]) {
        perfil = data[0];
        try { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(perfil)); } catch (e) {}
      }
    } catch (e) { /* sem o sql/031 ou sem rede: joga sem as perguntas da clínica */ }
  }

  // ── Menu ──────────────────────────────────────────────────────────────
  function menu() {
    const d = ler(), med = d.medalhas || {};
    const feitas = missoes().filter((m) => m.feito).length;
    palco.innerHTML = `
      <div class="jg-ola">${perfil && perfil.nome ? `Conheça a <b>${esc(perfil.nome)}</b> e` : "Teste"} o que você sabe de saúde. 😊</div>
      <div class="jg-grade">
        <button type="button" data-jg="quiz"><span>❓</span><b>Quiz</b><small>${perfil ? "A clínica, os exames e a saúde" : "Exames e saúde"}</small></button>
        <button type="button" data-jg="memoria"><span>🧠</span><b>Jogo da memória</b><small>Cada exame com a sua parte do corpo</small></button>
        <button type="button" data-jg="mitos"><span>✅</span><b>Verdade ou mito</b><small>Dicas de saúde com fonte</small></button>
        <button type="button" data-jg="missoes"><span>🗺️</span><b>Missões do indiDoc</b><small>${feitas} de 5 feitas</small></button>
      </div>
      <div class="jg-t">🏅 Suas medalhas</div>
      <div class="jg-medalhas">${Object.entries(MEDALHAS).map(([k, m]) =>
        `<div class="jg-med${med[k] ? " ganha" : ""}"><span>${m.icone}</span><b>${esc(m.nome)}</b><small>${med[k] ? "Conquistada!" : esc(m.como)}</small></div>`).join("")}</div>
      <p class="jg-aviso">Conteúdo educativo, com fontes oficiais. Não substitui a orientação do seu médico.</p>`;
  }

  // ── Quiz ──────────────────────────────────────────────────────────────
  function quiz() {
    const perguntas = rodadaQuiz(perfil, Math.random);
    let i = 0, acertos = 0;
    const mostrar = () => {
      const p = perguntas[i];
      palco.innerHTML = `<div class="jg-passo">Pergunta ${i + 1} de ${perguntas.length}${p.tipo === "clinica" ? " · 🏥 a clínica"
          : p.tipo === "indidoc" ? " · 📱 o indiDoc" : ""}</div>
        <div class="jg-perg">${esc(p.pergunta)}</div>
        <div class="jg-ops">${p.opcoes.map((o, k) => `<button type="button" data-op="${k}">${esc(o)}</button>`).join("")}</div>
        <div id="jg-resp"></div>`;
      for (const b of palco.querySelectorAll("[data-op]")) b.onclick = () => responder(+b.dataset.op);
    };
    const responder = (k) => {
      const p = perguntas[i], certo = k === p.certa;
      if (certo) acertos++;
      palco.querySelectorAll("[data-op]").forEach((b, n) => {
        b.disabled = true;
        if (n === p.certa) b.classList.add("certa"); else if (n === k) b.classList.add("errada");
      });
      q("jg-resp").innerHTML = `<div class="jg-expl ${certo ? "ok" : ""}"><b>${certo ? "Isso! 🎉" : "Quase!"}</b> ${esc(p.explica || "")}
        ${p.fonte ? `<small>Fonte: ${esc(p.fonte)}</small>` : ""}</div>
        <button type="button" class="jg-seguir">${i + 1 < perguntas.length ? "Próxima →" : "Ver resultado"}</button>`;
      palco.querySelector(".jg-seguir").onclick = () => { i++; if (i < perguntas.length) mostrar(); else fim(); };
    };
    const fim = () => {
      const est = Math.round(5 * acertos / perguntas.length);
      ganharEstrelas(est); marcar("quiz"); contar("quiz", est);
      const nova = acertos >= 4 && ganharMedalha("clinica");
      resultado(`${acertos} de ${perguntas.length} certas`, est, nova ? "clinica" : "", "quiz");
    };
    mostrar();
  }

  // ── Verdade ou mito ───────────────────────────────────────────────────
  function mitos() {
    const frases = rodadaMitos(perfil, Math.random);
    let i = 0, acertos = 0;
    const mostrar = () => {
      const f = frases[i];
      palco.innerHTML = `<div class="jg-passo">Frase ${i + 1} de ${frases.length}</div>
        <div class="jg-perg">“${esc(f.frase)}”</div>
        <div class="jg-vm"><button type="button" data-vm="1">✅ Verdade</button><button type="button" data-vm="0">❌ Mito</button></div>
        <div id="jg-resp"></div>`;
      for (const b of palco.querySelectorAll("[data-vm]")) b.onclick = () => responder(b.dataset.vm === "1");
    };
    const responder = (disse) => {
      const f = frases[i], certo = disse === f.verdade;
      if (certo) acertos++;
      palco.querySelectorAll("[data-vm]").forEach((b) => {
        b.disabled = true;
        if ((b.dataset.vm === "1") === f.verdade) b.classList.add("certa"); else b.classList.add("errada");
      });
      q("jg-resp").innerHTML = `<div class="jg-expl ${certo ? "ok" : ""}"><b>${f.verdade ? "Verdade." : "Mito."}</b> ${esc(f.explica)}
        <small>Fonte: ${esc(f.fonte)}</small></div>
        <button type="button" class="jg-seguir">${i + 1 < frases.length ? "Próxima →" : "Ver resultado"}</button>`;
      palco.querySelector(".jg-seguir").onclick = () => { i++; if (i < frases.length) mostrar(); else fim(); };
    };
    const fim = () => {
      ganharEstrelas(acertos); marcar("mitos"); contar("mito", acertos);
      const nova = acertos === frases.length && ganharMedalha("mitos");
      resultado(`${acertos} de ${frases.length} certas`, acertos, nova ? "mitos" : "", "mitos");
    };
    mostrar();
  }

  // ── Memória ───────────────────────────────────────────────────────────
  function memoria() {
    const pares = paresMemoria(perfil, Math.random);
    const cartas = window.JogosNucleo.embaralhar(pares.flatMap((p) => [
      { par: p.id, texto: p.exame, tipo: "exame" }, { par: p.id, texto: p.parte, tipo: "parte" }]), Math.random);
    let abertas = [], achados = 0, jogadas = 0, travado = false;
    palco.innerHTML = `<div class="jg-passo">Ache os pares: cada exame com a parte do corpo que ele avalia.</div>
      <div class="jg-mem">${cartas.map((c, k) => `<button type="button" data-c="${k}" class="${c.tipo}"><span>${esc(c.texto)}</span></button>`).join("")}</div>
      <div id="jg-resp"></div>`;
    for (const b of palco.querySelectorAll("[data-c]")) b.onclick = () => virar(b);
    function virar(b) {
      if (travado || b.classList.contains("aberta")) return;
      b.classList.add("aberta"); abertas.push(b);
      if (abertas.length < 2) return;
      jogadas++;
      const [a, c] = abertas.map((x) => cartas[+x.dataset.c]);
      if (a.par === c.par && a.tipo !== c.tipo) {
        abertas.forEach((x) => x.classList.add("achada")); abertas = []; achados++;
        const p = pares.find((x) => x.id === a.par);
        q("jg-resp").innerHTML = `<div class="jg-expl ok"><b>${esc(p.exame)}:</b> ${esc(p.oque)}</div>`;
        if (achados === pares.length) setTimeout(fim, 900);
      } else {
        travado = true;
        setTimeout(() => { abertas.forEach((x) => x.classList.remove("aberta")); abertas = []; travado = false; }, 900);
      }
    }
    function fim() {
      const est = jogadas <= pares.length + 2 ? 5 : jogadas <= pares.length + 5 ? 4 : 3;
      ganharEstrelas(est); marcar("memoria"); contar("memoria", est);
      const nova = ganharMedalha("memoria");
      resultado(`${jogadas} jogadas`, est, nova ? "memoria" : "", "memoria");
    }
  }

  // ── Missões do indiDoc ────────────────────────────────────────────────
  function missoes() {
    const f = (ler().feito) || {};
    const temDoc = lista("documentos").some((d) => !d.apagado);
    let comEmail = false;
    try { comEmail = typeof contaAnonima === "function" && !!usuario && !contaAnonima(); } catch (e) {}
    return [
      { id: "doc", titulo: "Guarde o seu primeiro exame", feito: temDoc, ir: "fotografar" },
      { id: "agenda", titulo: "Abra a sua Agenda", feito: !!f.agenda, ir: "agenda" },
      { id: "mostrar", titulo: "Veja como mostrar os exames ao médico", feito: !!f.mostrar, ir: "mostrar" },
      { id: "quiz", titulo: "Jogue uma rodada do quiz", feito: !!f.quiz, ir: "quiz" },
      { id: "email", titulo: "Guarde o seu acesso com o e-mail", feito: comEmail, ir: "conta" },
    ];
  }

  function telaMissoes() {
    const lista = missoes(), feitas = lista.filter((m) => m.feito).length;
    if (feitas === lista.length && ganharMedalha("indidoc")) {
      ganharEstrelas(5); contar("missoes", 5);
      return resultado("Todas as missões feitas", 5, "indidoc", "missoes");
    }
    palco.innerHTML = `<div class="jg-passo">${feitas} de ${lista.length} missões feitas</div>
      <div class="jg-barra"><i style="width:${Math.round(100 * feitas / lista.length)}%"></i></div>
      ${lista.map((m) => `<div class="jg-missao${m.feito ? " feita" : ""}"><span>${m.feito ? "✅" : "○"}</span><b>${esc(m.titulo)}</b>
        ${m.feito ? "" : `<button type="button" data-ir="${m.ir}">Fazer</button>`}</div>`).join("")}
      <p class="jg-aviso">Complete as 5 e ganhe a medalha 🗺️ Explorador do indiDoc.</p>`;
    for (const b of palco.querySelectorAll("[data-ir]")) b.onclick = () => irMissao(b.dataset.ir);
  }

  function irMissao(ir) {
    if (ir === "quiz") return quiz();
    fechar();
    try {
      if (ir === "fotografar") (q("ini-fotografar") || q("btn-fotografar")).click();
      else if (ir === "conta") { if (q("btn-conta")) q("btn-conta").click(); }
      else if (window.Abas) Abas.ir(ir);
    } catch (e) {}
  }
  // Agenda e "Mostrar ao médico" abertos de qualquer jeito contam a missão.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir='agenda'], [data-ir='mostrar'], #btn-mostrar");
    if (b && !tela.contains(b)) marcar(b.dataset.ir === "agenda" ? "agenda" : "mostrar");
  }, true);

  // ── Resultado ─────────────────────────────────────────────────────────
  function resultado(titulo, estrelas, medalha, deNovo) {
    const m = medalha ? MEDALHAS[medalha] : null;
    palco.innerHTML = `<div class="jg-fim"><div class="jg-est">${"⭐".repeat(estrelas)}${"☆".repeat(5 - estrelas)}</div>
      <b>${esc(titulo)}</b>
      ${m ? `<div class="jg-nova">${m.icone} Medalha nova: <b>${esc(m.nome)}</b>!</div>` : ""}
      <div class="jg-fim-bts"><button type="button" class="jg-seguir" data-jg="${deNovo}">Jogar de novo</button>
      <button type="button" class="jg-menu" data-jg="menu">Outros jogos</button></div></div>`;
  }

  palco.addEventListener("click", (e) => {
    const b = e.target.closest("[data-jg]");
    if (!b) return;
    const acao = { quiz, memoria, mitos, missoes: telaMissoes, menu }[b.dataset.jg];
    if (acao) acao();
  });

  // ── Abrir e fechar ────────────────────────────────────────────────────
  async function abrir(deOnde) {
    origem = deOnde || "app";
    tela.classList.remove("escondido");
    document.body.classList.add("sem-rolar");
    pintarTopo(); menu();
    contar("abriu", null);
    await carregarPerfil();
    pintarTopo(); menu();
  }
  function fechar() { tela.classList.add("escondido"); document.body.classList.remove("sem-rolar"); }
  q("jg-fechar").onclick = () => (palco.querySelector(".jg-grade") ? fechar() : menu());

  // Botão do Início: "dia" quando há consulta hoje (o destaque)
  function consultaHoje() {
    let hoje = "";
    try { hoje = hojeISO(); } catch (e) {}
    return lista("compromissos")
      .some((c) => c.quando === hoje && c.origem === "clinica" && !c.apagado && !c.cancelado);
  }
  function pintarBotao() {
    const b = q("ini-jogos");
    if (!b) return;
    const dia = consultaHoje();
    b.classList.toggle("destaque", dia);
    q("ini-jogos-sub").textContent = dia ? "Consulta hoje? Conheça a clínica enquanto espera"
                                         : "Quiz, memória e verdade ou mito";
  }
  if (q("ini-jogos")) {
    q("ini-jogos").onclick = () => abrir(consultaHoje() ? "dia" : "app");
    pintarBotao(); setInterval(pintarBotao, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pintarBotao(); });
  }

  // Link curto: ?j=<código>&o=<origem>, ou #jogos
  const ps = new URLSearchParams(location.search);
  const j = (ps.get("j") || "").toLowerCase();
  if (/^[a-z0-9]{8}$/.test(j) || location.hash === "#jogos") {
    codigo = /^[a-z0-9]{8}$/.test(j) ? j : "";
    const o = ps.get("o");
    history.replaceState(history.state, "", location.pathname);
    setTimeout(() => abrir(["whatsapp", "balcao", "tv", "totem"].includes(o) ? o : "app"), 300);
  }

  window.Jogos = { abrir, fechar };
})();
