/* ═══════════════════════════════════════════════════════════════════════
   📈 MEU DIÁRIO DE SAÚDE (sql/034, 18/11/2026 — pedido do usuário: "quero o
   4"; decisões: pressão + pulso, glicemia e peso; o app mostra a FAIXA COM A
   FONTE; o médico vê nos SINAIS VITAIS do prontuário do Indiclin).

   • O paciente anota a medida (da pessoa ativa — só as pessoas da própria
     conta; quem é cuidado junto anota na conta dela) e vê o histórico com
     um gráfico simples.
   • Cada medida mostra a faixa e a fonte; valor muito alterado avisa para
     procurar atendimento. Criança/adolescente (< 18): sem faixa de adulto —
     "quem avalia é o pediatra".
   • "Mostrar ao médico": por clínica que já manda documentos (recebimento
     vivo), padrão DESLIGADO. Ligado, o Indiclin mostra as medidas nos
     sinais vitais do prontuário (emitir-acesso, ação "medidas").
   • Sem internet: a medida fica guardada no aparelho e sobe depois.

   Núcleo puro em window.DiarioNucleo (testes/testar_diario.js).
   Carregado depois de app.js. Usa `sb`, `pessoas`, `pessoaAtiva`, `pessoaDe`,
   `usuario`, `escaparHTML`, `aviso`, `FECHAR_TELA_CHEIA`.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  // ── Núcleo puro ───────────────────────────────────────────────────────
  const FONTES = {
    pressao: "Diretrizes Brasileiras de Hipertensão Arterial 2020 (SBC): na medida feita em casa, o normal é abaixo de 130/80 mmHg.",
    glicemia: "Diretriz da Sociedade Brasileira de Diabetes: em jejum, o normal é de 70 a 99 mg/dL; 2 horas depois de comer, abaixo de 140.",
    imc: "Organização Mundial da Saúde (IMC de adultos); a partir de 60 anos, Ministério da Saúde (SISVAN).",
  };
  // Mesmos limites do banco (sql/034): só barram o impossível
  const LIMITES = { sis: [50, 300], dia: [20, 200], pulso: [20, 250], glicemia: [10, 800], peso: [1, 400], altura: [40, 250] };
  const MOMENTOS = { jejum: "Em jejum", antes_refeicao: "Antes de comer", depois_refeicao: "2 h depois de comer", outro: "Outro momento" };
  const URGENTE = "Se continuar assim ou tiver dor no peito, falta de ar, dor de cabeça forte, fraqueza ou alteração na fala ou na visão, procure atendimento de urgência (SAMU 192).";

  const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const dentro = (v, [a, b]) => v != null && v >= a && v <= b;

  function idadeEm(nascISO, hojeISO) {
    const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascISO || ""), h = /^(\d{4})-(\d{2})-(\d{2})/.exec(hojeISO || "");
    if (!n || !h) return null;
    let anos = +h[1] - +n[1];
    if (+h[2] < +n[2] || (+h[2] === +n[2] && +h[3] < +n[3])) anos--;
    return anos;
  }

  // "" quando pode gravar; senão o motivo
  function validar(tipo, c) {
    if (tipo === "pressao") {
      const s = num(c.sis), d = num(c.dia), p = c.pulso === "" || c.pulso == null ? null : num(c.pulso);
      if (!dentro(s, LIMITES.sis)) return "Confira a máxima (o primeiro número, entre 50 e 300).";
      if (!dentro(d, LIMITES.dia)) return "Confira a mínima (o segundo número, entre 20 e 200).";
      if (d >= s) return "A mínima tem que ser menor que a máxima.";
      if (p != null && !dentro(p, LIMITES.pulso)) return "Confira o pulso (entre 20 e 250).";
      return "";
    }
    if (tipo === "glicemia") {
      if (!dentro(num(c.valor), LIMITES.glicemia)) return "Confira a glicemia (entre 10 e 800 mg/dL).";
      if (!MOMENTOS[c.momento]) return "Diga quando mediu (em jejum, antes ou depois de comer).";
      return "";
    }
    if (tipo === "peso") return dentro(num(c.valor), LIMITES.peso) ? "" : "Confira o peso (em kg).";
    return "Tipo desconhecido.";
  }

  // nivel: normal | acima | alta | baixa | muito_alta | info
  function classificarPressao(sis, dia, idade) {
    if (idade != null && idade < 18) return { nivel: "info", texto: "Para crianças e adolescentes, quem avalia a pressão é o pediatra (as faixas são outras)." };
    if (sis >= 180 || dia >= 120) return { nivel: "muito_alta", texto: "Pressão muito alta. Descanse 5 minutos e meça de novo. " + URGENTE, fonte: FONTES.pressao };
    if (sis < 90 || dia < 60) return { nivel: "baixa", texto: "Pressão baixa. Se tiver tontura, fraqueza ou desmaio, procure atendimento.", fonte: FONTES.pressao };
    if (sis >= 130 || dia >= 80) return { nivel: "acima", texto: "Acima do esperado para medida em casa (abaixo de 130/80). Anote e mostre ao seu médico.", fonte: FONTES.pressao };
    return { nivel: "normal", texto: "Dentro do esperado para medida em casa.", fonte: FONTES.pressao };
  }
  function classificarPulso(p, idade) {
    if (p == null || (idade != null && idade < 18)) return null;
    if (p < 50 || p > 100) return { nivel: "acima", texto: `Pulso de ${p} — fora do comum em repouso para adultos (50 a 100). Se tiver sintomas, procure atendimento.` };
    return null;
  }
  function classificarGlicemia(v, momento, idade) {
    const dm = "Se você tem diabetes, vale a meta que o seu médico combinou.";
    if (v < 70) return { nivel: "baixa", texto: "Glicemia baixa (hipoglicemia). Se tiver tremor, suor frio ou confusão, siga a orientação do seu médico para hipoglicemia ou procure atendimento.", fonte: FONTES.glicemia };
    if (v >= 300) return { nivel: "muito_alta", texto: "Glicemia muito alta. Procure atendimento, principalmente se tiver sede intensa, enjoo, vômitos ou sonolência.", fonte: FONTES.glicemia };
    if (idade != null && idade < 18) return { nivel: "info", texto: "Para crianças e adolescentes, quem avalia é o pediatra.", fonte: FONTES.glicemia };
    if (momento === "jejum") {
      if (v <= 99) return { nivel: "normal", texto: "Dentro do normal em jejum (70 a 99).", fonte: FONTES.glicemia };
      if (v <= 125) return { nivel: "acima", texto: "Acima do normal em jejum (70 a 99). Mostre ao seu médico. " + dm, fonte: FONTES.glicemia };
      return { nivel: "alta", texto: "Alta para jejum (126 ou mais). Mostre ao seu médico. " + dm, fonte: FONTES.glicemia };
    }
    if (momento === "depois_refeicao") {
      if (v < 140) return { nivel: "normal", texto: "Dentro do normal 2 horas depois de comer (abaixo de 140).", fonte: FONTES.glicemia };
      if (v < 200) return { nivel: "acima", texto: "Acima do normal 2 horas depois de comer (abaixo de 140). Mostre ao seu médico. " + dm, fonte: FONTES.glicemia };
      return { nivel: "alta", texto: "Alta depois de comer (200 ou mais). Mostre ao seu médico. " + dm, fonte: FONTES.glicemia };
    }
    if (v >= 200) return { nivel: "alta", texto: "Alta (200 ou mais). Mostre ao seu médico. " + dm, fonte: FONTES.glicemia };
    return { nivel: "info", texto: "Anotada. Para comparar com a faixa, meça em jejum ou 2 horas depois de comer.", fonte: FONTES.glicemia };
  }
  const imc = (peso, alturaCm) => (peso && alturaCm ? Math.round((peso / Math.pow(alturaCm / 100, 2)) * 10) / 10 : null);
  function classificarImc(v, idade) {
    if (v == null) return { nivel: "info", texto: "Informe a sua altura para ver o IMC." };
    if (idade != null && idade < 18) return { nivel: "info", texto: `IMC ${v}. Para crianças e adolescentes, o pediatra avalia pelo gráfico de crescimento.` };
    if (idade != null && idade >= 60) {
      if (v < 22) return { nivel: "baixa", texto: `IMC ${v}: abaixo do adequado para 60 anos ou mais (22 a 27).`, fonte: FONTES.imc };
      if (v <= 27) return { nivel: "normal", texto: `IMC ${v}: adequado para 60 anos ou mais (22 a 27).`, fonte: FONTES.imc };
      return { nivel: "acima", texto: `IMC ${v}: acima do adequado para 60 anos ou mais (22 a 27).`, fonte: FONTES.imc };
    }
    if (v < 18.5) return { nivel: "baixa", texto: `IMC ${v}: abaixo do peso (18,5 a 24,9 é o adequado).`, fonte: FONTES.imc };
    if (v < 25) return { nivel: "normal", texto: `IMC ${v}: peso adequado (18,5 a 24,9).`, fonte: FONTES.imc };
    if (v < 30) return { nivel: "acima", texto: `IMC ${v}: sobrepeso (25 a 29,9).`, fonte: FONTES.imc };
    return { nivel: "alta", texto: `IMC ${v}: obesidade (30 ou mais). Converse com o seu médico.`, fonte: FONTES.imc };
  }
  // Pontos do gráfico (0..1) para uma série de valores, do mais antigo ao mais novo
  function pontos(valores, alto) {
    const v = valores.filter((x) => x != null);
    if (!v.length) return [];
    const min = Math.min(...v), max = Math.max(...v), faixa = max - min || 1;
    return valores.map((x, i) => (x == null ? null : [valores.length === 1 ? 0.5 : i / (valores.length - 1), 1 - (x - min) / faixa]))
      .map((p) => (p ? [p[0], 0.1 + p[1] * 0.8 * (alto || 1)] : null));
  }
  window.DiarioNucleo = { FONTES, LIMITES, MOMENTOS, idadeEm, validar, classificarPressao, classificarPulso,
                          classificarGlicemia, imc, classificarImc, pontos };

  // ── A tela (só no navegador) ──────────────────────────────────────────
  if (typeof document === "undefined") return;
  const tela = document.getElementById("tela-diario");
  if (!tela) return;
  const q = (id) => document.getElementById(id);
  const esc = (t) => escaparHTML(t == null ? "" : String(t));
  const palco = q("dr-palco");
  const CHAVE_PEND = "diario-pendentes", CHAVE_ALT = "diario-altura";
  let aba = "pressao", lista = [], clinicas = [], compart = new Set();

  const hoje = () => { try { return hojeISO(); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const pessoa = () => (typeof pessoaDe === "function" ? pessoaDe(pessoaAtiva) : null);
  const minha = () => { const p = pessoa(); return !!p && (!usuario || p.conta_id === usuario.id); };
  const idade = () => idadeEm((pessoa() || {}).data_nascimento, hoje());
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? padrao; } catch (e) { return padrao; } };
  const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const altura = () => (ler(CHAVE_ALT, {}) || {})[pessoaAtiva] || null;
  const quando = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

  // Medidas guardadas no aparelho (sem internet) — sobem depois
  async function subirPendentes() {
    const pend = ler(CHAVE_PEND, []);
    if (!pend.length || !navigator.onLine || typeof sb === "undefined" || !sb) return;
    const resto = [];
    for (const m of pend) {
      const { error } = await sb.from("medidas").insert(m);
      if (error && !/violates|check|foreign/i.test(error.message)) resto.push(m);   // erro de dado: descarta
    }
    gravarLocal(CHAVE_PEND, resto);
  }

  async function carregar() {
    lista = [];
    if (!minha()) return;
    await subirPendentes();
    try {
      const { data } = await sb.from("medidas").select("id, tipo, valor1, valor2, pulso, momento, medido_em")
        .eq("pessoa_id", pessoaAtiva).is("apagado_em", null).order("medido_em", { ascending: false }).limit(200);
      lista = data || [];
    } catch (e) { lista = []; }
    // pendentes desta pessoa aparecem também
    lista = [...ler(CHAVE_PEND, []).filter((m) => m.pessoa_id === pessoaAtiva).map((m) => ({ ...m, pendente: true })), ...lista];
    try {
      const [{ data: rec }, { data: comp }] = await Promise.all([
        sb.from("recebimentos").select("clinica_id, clinica_nome").eq("pessoa_id", pessoaAtiva).is("revogado_em", null),
        sb.from("medidas_compartilhadas").select("clinica_id").eq("pessoa_id", pessoaAtiva).is("revogado_em", null),
      ]);
      clinicas = rec || []; compart = new Set((comp || []).map((c) => c.clinica_id));
    } catch (e) { clinicas = []; compart = new Set(); }
  }

  const COR = { normal: "ok", acima: "atencao", alta: "alerta", baixa: "atencao", muito_alta: "urgente", info: "info" };
  function avaliacao(m) {
    const id = idade();
    if (m.tipo === "pressao") return classificarPressao(+m.valor1, +m.valor2, id);
    if (m.tipo === "glicemia") return classificarGlicemia(+m.valor1, m.momento, id);
    return classificarImc(imc(+m.valor1, altura()), id);
  }
  const textoMedida = (m) => (m.tipo === "pressao" ? `${+m.valor1}/${+m.valor2} mmHg${m.pulso ? ` · pulso ${m.pulso}` : ""}`
    : m.tipo === "glicemia" ? `${+m.valor1} mg/dL · ${MOMENTOS[m.momento] || ""}` : `${String(+m.valor1).replace(".", ",")} kg`);

  function grafico(itens) {
    const ult = itens.slice(0, 20).reverse();
    if (ult.length < 2) return "";
    const W = 300, H = 90;
    const linha = (vals, cor) => {
      const ps = pontos(vals).filter(Boolean).map(([x, y]) => `${(x * (W - 20) + 10).toFixed(1)},${(y * H).toFixed(1)}`);
      return `<polyline fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round" points="${ps.join(" ")}"/>`;
    };
    const series = aba === "pressao" ? linha(ult.map((m) => +m.valor1), "#0e7490") + linha(ult.map((m) => +m.valor2), "#14b8a6")
      : linha(ult.map((m) => +m.valor1), "#0e7490");
    return `<svg class="dr-graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${series}</svg>
      <div class="dr-graf-leg">${aba === "pressao" ? "<b style='color:#0e7490'>━</b> máxima <b style='color:#14b8a6'>━</b> mínima · " : ""}últimas ${ult.length} medidas</div>`;
  }

  function formulario() {
    if (aba === "pressao") return `<div class="dr-campos">
        <label>Máxima<input id="dr-sis" inputmode="numeric" placeholder="120" maxlength="3"></label>
        <span class="dr-x">/</span>
        <label>Mínima<input id="dr-dia" inputmode="numeric" placeholder="80" maxlength="3"></label>
        <label>Pulso <small>(opcional)</small><input id="dr-pulso" inputmode="numeric" placeholder="72" maxlength="3"></label></div>`;
    if (aba === "glicemia") return `<div class="dr-campos">
        <label>Glicemia (mg/dL)<input id="dr-valor" inputmode="numeric" placeholder="95" maxlength="3"></label>
        <label>Quando<select id="dr-momento">${Object.entries(MOMENTOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></label></div>`;
    return `<div class="dr-campos">
        <label>Peso (kg)<input id="dr-valor" inputmode="decimal" placeholder="70,5" maxlength="5"></label>
        <label>Altura (cm)<input id="dr-altura" inputmode="numeric" placeholder="170" maxlength="3" value="${esc(altura() || "")}"></label></div>`;
  }

  function desenhar() {
    const p = pessoa();
    if (!p) { palco.innerHTML = `<p class="dr-vazio">Entre na sua conta para usar o diário.</p>`; return; }
    if (!minha()) {
      palco.innerHTML = `<p class="dr-vazio">O diário de ${esc(p.nome || "quem você cuida")} é anotado na conta dessa pessoa.</p>`;
      return;
    }
    const itens = lista.filter((m) => m.tipo === aba);
    palco.innerHTML = `
      <div class="dr-quem">Diário de <b>${esc(p.nome || "você")}</b></div>
      <div class="dr-abas">${[["pressao", "❤️ Pressão"], ["glicemia", "🩸 Glicemia"], ["peso", "⚖️ Peso"]].map(([k, t]) =>
        `<button type="button" data-dr-aba="${k}" class="${k === aba ? "sel" : ""}">${t}</button>`).join("")}</div>
      <div class="dr-novo"><div class="dr-t">Nova medida</div>${formulario()}
        <button type="button" class="dr-salvar" id="dr-salvar">Guardar</button><div id="dr-msg"></div></div>
      ${grafico(itens)}
      <div class="dr-t">Histórico</div>
      ${itens.length ? itens.slice(0, 30).map((m) => {
        const a = avaliacao(m);
        return `<div class="dr-item ${COR[a.nivel] || ""}"><div class="dr-item-l"><b>${esc(textoMedida(m))}</b>
          <small>${esc(quando(m.medido_em))}${m.pendente ? " · ⏳ sobe quando tiver internet" : ""}</small>
          <span>${esc(a.texto)}</span></div>
          ${m.id && !m.pendente ? `<button type="button" class="dr-apagar" data-dr-apagar="${esc(m.id)}" aria-label="Apagar">✕</button>` : ""}</div>`;
      }).join("") : `<p class="dr-vazio">Nenhuma medida ainda.</p>`}
      ${itens.length ? `<p class="dr-fonte">Fonte: ${esc((avaliacao(itens[0]).fonte) || FONTES[aba === "peso" ? "imc" : aba])}</p>` : ""}
      <div class="dr-t">🩺 Mostrar ao médico</div>
      ${clinicas.length ? `<p class="dr-aviso-p">Ligado, o médico da clínica vê as suas medidas nos sinais vitais do prontuário. Pode desligar quando quiser.</p>
        ${clinicas.map((c) => `<label class="dr-comp"><input type="checkbox" data-dr-clinica="${esc(c.clinica_id)}"${compart.has(c.clinica_id) ? " checked" : ""}>
          <span>${esc(c.clinica_nome || "Clínica")}</span></label>`).join("")}`
        : `<p class="dr-aviso-p">Quando uma clínica que usa o Indiclin mandar documentos para você, dá para mostrar o diário ao médico dela.</p>`}
      <p class="dr-aviso">As faixas são as das diretrizes, para adultos. Não substituem a avaliação do seu médico.</p>`;
    ligar();
  }

  function ligar() {
    for (const b of palco.querySelectorAll("[data-dr-aba]")) b.onclick = () => { aba = b.dataset.drAba; desenhar(); };
    q("dr-salvar").onclick = salvar;
    for (const b of palco.querySelectorAll("[data-dr-apagar]")) b.onclick = () => apagar(b.dataset.drApagar);
    for (const c of palco.querySelectorAll("[data-dr-clinica]")) c.onchange = () => compartilhar(c.dataset.drClinica, c.checked, c);
  }

  async function salvar() {
    const msg = q("dr-msg");
    const campos = aba === "pressao" ? { sis: q("dr-sis").value, dia: q("dr-dia").value, pulso: q("dr-pulso").value }
      : { valor: q("dr-valor").value, momento: (q("dr-momento") || {}).value };
    const erro = validar(aba, campos);
    if (erro) { msg.innerHTML = `<span class="dr-erro">${esc(erro)}</span>`; return; }
    if (aba === "peso" && q("dr-altura").value) {
      const a = num(q("dr-altura").value);
      if (!dentro(a, LIMITES.altura)) { msg.innerHTML = `<span class="dr-erro">Confira a altura (em cm, ex.: 170).</span>`; return; }
      const alts = ler(CHAVE_ALT, {}) || {}; alts[pessoaAtiva] = a; gravarLocal(CHAVE_ALT, alts);
    }
    const linha = { conta_id: usuario.id, pessoa_id: pessoaAtiva, tipo: aba, medido_em: new Date().toISOString(),
      valor1: aba === "pressao" ? num(campos.sis) : num(campos.valor),
      valor2: aba === "pressao" ? num(campos.dia) : null,
      pulso: aba === "pressao" && campos.pulso ? Math.round(num(campos.pulso)) : null,
      momento: aba === "glicemia" ? campos.momento : null };
    const a = avaliacao(linha);
    let guardado = false;
    if (navigator.onLine && typeof sb !== "undefined" && sb) {
      const { error } = await sb.from("medidas").insert(linha);
      if (!error) guardado = true;
      else if (/violates|check|foreign/i.test(error.message)) { msg.innerHTML = `<span class="dr-erro">Não deu para guardar essa medida. Confira os números.</span>`; return; }
    }
    if (!guardado) { const pend = ler(CHAVE_PEND, []); pend.push(linha); gravarLocal(CHAVE_PEND, pend); }
    await carregar(); desenhar();
    const m = q("dr-msg");
    m.innerHTML = `<div class="dr-item ${COR[a.nivel] || ""}"><div class="dr-item-l"><b>${guardado ? "✔️ Guardado" : "⏳ Guardado no celular — sobe quando tiver internet"}</b>
      <span>${esc(a.texto)}</span>${aba === "pressao" && classificarPulso(linha.pulso, idade()) ? `<span>${esc(classificarPulso(linha.pulso, idade()).texto)}</span>` : ""}</div></div>`;
    if (a.nivel === "muito_alta") try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  async function apagar(id) {
    const ok = typeof confirmarModal === "function" ? await confirmarModal("Apagar esta medida?", { textoConfirmar: "Apagar", perigo: true }) : confirm("Apagar esta medida?");
    if (!ok) return;
    await sb.from("medidas").update({ apagado_em: new Date().toISOString() }).eq("id", id);
    await carregar(); desenhar();
  }

  async function compartilhar(clinica, ligar, caixa) {
    try {
      const { error } = await sb.rpc("compartilhar_medidas", { p_pessoa: pessoaAtiva, p_clinica: clinica, p_ligar: ligar });
      if (error) throw error;
      if (ligar) compart.add(clinica); else compart.delete(clinica);
      if (typeof aviso === "function") aviso(ligar ? "O médico da clínica passa a ver o seu diário." : "O médico deixa de ver o seu diário.", "ok");
    } catch (e) {
      caixa.checked = !ligar;
      if (typeof aviso === "function") aviso("Não consegui mudar agora. Tente de novo com internet.", "erro");
    }
  }

  async function abrir() {
    tela.classList.remove("escondido");
    document.body.classList.add("sem-rolar");
    palco.innerHTML = `<p class="dr-vazio">Carregando…</p>`;
    await carregar(); desenhar();
  }
  function fechar() { tela.classList.add("escondido"); document.body.classList.remove("sem-rolar"); }
  q("dr-fechar").onclick = fechar;
  const bIni = q("ini-diario");
  if (bIni) bIni.onclick = abrir;
  window.addEventListener("online", subirPendentes);
  if (typeof FECHAR_TELA_CHEIA === "object") FECHAR_TELA_CHEIA["tela-diario"] = "dr-fechar";
  window.Diario = { abrir, fechar };
})();
