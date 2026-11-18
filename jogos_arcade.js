/* ═══════════════════════════════════════════════════════════════════════
   ⚡ JOGOS MAIS AGITADOS da sala de espera (17/11/2026, pedido do usuário:
   "quero todos… é possível um tipo pac man?"). Entram no menu dos jogos
   (jogos.js) pela seção "⚡ Mais agitados":

     ⚡ Relâmpago        60 s de quiz, combo de acertos (x2, x3); no fim, a
                         explicação das que errou
     🍎 Pegue o saudável  toque nos alimentos saudáveis que caem; o que fazer
                         mal tira vida; no fim, a dica (com fonte)
     🧍 Monte o corpo     arraste (ou toque e toque) cada exame até a parte
                         do corpo que ele avalia
     💧 Labirinto         a gotinha come as vitaminas e foge dos germes; a
                         maçã deixa os germes fracos. Criação nossa — nada
                         de personagem ou visual de jogo conhecido
     🌬️ Respire comigo   1 minuto de respiração guiada (calma antes do exame)

   🏆 PLACAR DA SALA DE ESPERA (sql/032): no fim do Relâmpago, do Saudável e
   do Labirinto, quem chegou pela clínica (perfil com código) pode entrar no
   placar do dia com um APELIDO SORTEADO de duas listas fixas ("Capivara
   Veloz") — nada de texto livre na TV da clínica, nada de nome. O banco só
   aceita apelido dessas listas (registrar_placar). A TV da clínica mostra o
   top 5 do dia (Indiclin, painel_tv).

   17/11/2026 (2ª leva, "realize todas as melhorias… e um controle de
   velocidade no labirinto"): relógio que PAUSA com o app em segundo plano;
   Relâmpago completa com as outras áreas e começa pelo mais fácil; "+pontos"
   subindo; itens especiais e contagem 3-2-1 no Saudável; Labirinto com
   dificuldade (Fácil/Normal/Difícil), pausa, 2º mapa e germes de jeitos
   diferentes; Monte o corpo por nível (ícones só no 1) com pulmões, rins,
   ossos e cérebro; Respire com vibração e 1 ou 3 minutos; recorde de cada
   jogo no menu.

   Núcleo puro em window.JogosArcade (testes/testar_jogos.js).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const C = window.JOGOS_CONTEUDO, J = window.JogosNucleo;
  if (!C || !J) return;

  // ── Núcleo puro ───────────────────────────────────────────────────────
  // Apelidos do placar: as MESMAS listas estão no sql/032 (registrar_placar).
  const ANIMAIS = ["Capivara", "Tucano", "Jabuti", "Boto", "Mico", "Tatu", "Quati", "Sabiá",
                   "Tamanduá", "Arara", "Onça", "Coruja", "Lontra", "Garça", "Paca", "Pinguim"];
  const JEITOS = ["Veloz", "Feliz", "Gentil", "Ágil", "Valente", "Alegre", "Forte", "Azul",
                  "Verde", "Brilhante", "Sábia", "Esperta"];
  // "Sábia"/"Esperta" só com bicho feminino; o resto vale para todos
  const FEMININOS = new Set(["Capivara", "Arara", "Onça", "Coruja", "Lontra", "Garça", "Paca"]);
  function apelido(rnd) {
    const a = ANIMAIS[Math.floor(rnd() * ANIMAIS.length)];
    const ok = JEITOS.filter((j) => FEMININOS.has(a) || (j !== "Sábia" && j !== "Esperta"));
    return a + " " + ok[Math.floor(rnd() * ok.length)];
  }
  function apelidoValido(t) {
    const [a, j, ...resto] = String(t || "").split(" ");
    return !resto.length && ANIMAIS.includes(a) && JEITOS.includes(j);
  }

  const multiplicador = (combo) => Math.min(3, 1 + Math.floor(combo / 3));

  // Relâmpago: todas as perguntas do quiz (clínica, saúde, indiDoc) + os
  // mitos como Verdade/Mito, já com a certa marcada.
  // Pouca pergunta (clínica sem perfil): completa com as outras áreas, para
  // não repetir dentro do mesmo minuto. Começa pelo mais fácil (3 de
  // verdade ou mito, de 2 opções) e depois mistura.
  const MINIMO_RELAMPAGO = 45;
  function poolRelampago(perfil, rnd) {
    let areas = J.areasDoPerfil(perfil);
    const montarPool = (ar) => {
      const quiz = [...J.perguntasDaClinica(perfil, rnd), ...J.perguntasDeSaude(ar, rnd),
                    ...C.INDIDOC.map((q) => ({ ...q, tipo: "indidoc" }))].map((q) => J.montar(q, rnd));
      const mitos = C.MITOS.filter((m) => ar.has(m.area)).map((m) => ({
        pergunta: "“" + m.frase + "”", opcoes: ["✅ Verdade", "❌ Mito"], certa: m.verdade ? 0 : 1,
        explica: m.explica, fonte: m.fonte, tipo: "mito" }));
      return J.embaralhar([...quiz, ...mitos], rnd);
    };
    let pool = montarPool(areas);
    if (pool.length < MINIMO_RELAMPAGO) {
      const vistas = new Set(pool.map((q) => q.pergunta));
      const extra = montarPool(new Set(Object.keys(C.AREAS))).filter((q) => !vistas.has(q.pergunta) && q.tipo !== "clinica");
      pool = [...pool, ...extra];
    }
    const faceis = pool.filter((q) => q.tipo === "mito").slice(0, 3);
    return [...faceis, ...pool.filter((q) => !faceis.includes(q))];
  }
  const estrelasRelampago = (acertos) => (acertos >= 12 ? 5 : acertos >= 9 ? 4 : acertos >= 6 ? 3 : acertos >= 3 ? 2 : 1);

  // Pegue o saudável. Dicas do que EVITAR: Guia Alimentar para a População
  // Brasileira (Ministério da Saúde, 2014), OMS (sal) e INCA (cigarro).
  const GUIA = "Guia Alimentar para a População Brasileira (Ministério da Saúde)";
  const SAUDAVEIS = ["🍎", "🍌", "🥦", "🥕", "🍇", "💧", "🥗", "🍓", "🐟", "🍊"];
  const EVITAR = [
    { e: "🥤", nome: "Refrigerante", dica: "Refrigerantes e sucos de caixinha têm muito açúcar. No dia a dia, prefira água.", fonte: GUIA },
    { e: "🍟", nome: "Fritura", dica: "Frituras e salgadinhos de pacote têm muita gordura e sal. Prefira alimentos in natura ou minimamente processados.", fonte: GUIA },
    { e: "🍩", nome: "Doce industrializado", dica: "Doces e biscoitos recheados são ultraprocessados: o melhor é evitá-los no dia a dia.", fonte: GUIA },
    { e: "🍬", nome: "Bala", dica: "Açúcar em excesso favorece a cárie e o ganho de peso. Escove os dentes depois dos doces.", fonte: "Ministério da Saúde" },
    { e: "🧂", nome: "Sal em excesso", dica: "A OMS recomenda menos de 5 g de sal por dia (cerca de uma colher de chá). Sal demais aumenta a pressão.", fonte: "Organização Mundial da Saúde" },
    { e: "🍔", nome: "Lanche rápido", dica: "Lanches tipo fast-food costumam ter muito sal e gordura: deixe para ocasiões especiais.", fonte: GUIA },
    { e: "🚬", nome: "Cigarro", dica: "Fumar causa câncer e doenças do coração e do pulmão. O SUS oferece tratamento gratuito para parar de fumar.", fonte: "Instituto Nacional de Câncer (INCA)" },
  ];
  // Especiais (raros): 💖 vida extra (ou +30 com as 3 vidas), 🌟 pontos em dobro por 5 s
  const ESPECIAIS = [{ e: "💖", esp: "vida" }, { e: "🌟", esp: "dobro" }];
  const CHANCE_ESPECIAL = 0.06, ESPERA_INICIO = 3;
  const velocidadeQueda = (seg) => 110 + 5 * seg;                   // px/s
  const intervaloNovo = (seg) => Math.max(420, 950 - 9 * seg);      // ms
  const estrelasSaudavel = (p) => (p >= 600 ? 5 : p >= 400 ? 4 : p >= 250 ? 3 : p >= 100 ? 2 : 1);

  // Monte o corpo: as áreas que têm lugar no corpo (x, y no desenho 200×300)
  // Desenho 200×320 (cabeça maior para caber cérebro, olhos e dentes)
  const ZONAS = {
    neuro:    { nome: "Cérebro e nervos", ic: "🧠", x: 100, y: 30 },
    oftalmo:  { nome: "Olhos", ic: "👁️", x: 100, y: 55 },
    odonto:   { nome: "Dentes", ic: "🦷", x: 100, y: 80 },
    otorrino: { nome: "Ouvido, nariz e garganta", ic: "👂", x: 148, y: 56 },
    pneumo:   { nome: "Pulmões", ic: "🌬️", x: 80, y: 138 },
    cardio:   { nome: "Coração", ic: "❤️", x: 118, y: 142 },
    nefro:    { nome: "Rins e vias urinárias", ic: "💧", x: 100, y: 182 },
    gineco:   { nome: "Saúde da mulher", ic: "🌸", x: 100, y: 214 },
    dermato:  { nome: "Pele", ic: "✋", x: 30, y: 216 },
    orto:     { nome: "Ossos e articulações", ic: "🦴", x: 80, y: 266 },
  };
  // Nível 1: 4 exames com os ícones nas zonas; 2: 5 sem ícone; 3: 6 sem ícone
  const CORPO_NIVEL = [{ n: 4, icones: true }, { n: 5, icones: false }, { n: 6, icones: false }];
  function rodadaCorpo(perfil, rnd, n) {
    const areas = J.areasDoPerfil(perfil);
    const ordem = J.embaralhar(Object.keys(ZONAS), rnd).sort((a, b) => (areas.has(b) ? 1 : 0) - (areas.has(a) ? 1 : 0));
    const out = [];
    for (const a of ordem) {
      const p = J.embaralhar(C.PROCEDIMENTOS.filter((x) => x.area === a), rnd)[0];
      if (p) out.push({ area: a, exame: p.nome, oque: p.oque });
      if (out.length === (n || 4)) break;
    }
    return J.embaralhar(out, rnd);
  }

  // Labirinto: # parede, . vitamina, o maçã, P gotinha, G germe
  const MAPA = [
    "###############",
    "#o.....#.....o#",
    "#.###.###.###.#",
    "#.............#",
    "#.#.##.#.##.#.#",
    "#...#..G..#...#",
    "###.#.###.#.###",
    "#...#.G.G.#...#",
    "###.#.###.#.###",
    "#.............#",
    "#.###.#.#.###.#",
    "#o..#..P..#..o#",
    "##.#.#####.#.##",
    "#......#......#",
    "###############",
  ];
  // 2º mapa (fases pares)
  const MAPA2 = [
    "###############",
    "#o...#...#...o#",
    "#.#.#.#.#.#.#.#",
    "#.............#",
    "#.###.#.#.###.#",
    "#.....#G#.....#",
    "###.#.....#.###",
    "#...#.G#G.#...#",
    "#.#...#.#...#.#",
    "#.#.###.###.#.#",
    "#.............#",
    "#.##.#.P.#.##.#",
    "#o...#...#...o#",
    "#...#.....#...#",
    "###############",
  ];
  const mapaDaFase = (fase) => (fase % 2 === 0 ? MAPA2 : MAPA);
  // Dificuldade (controle de velocidade): ms por passo dos germes e da
  // gotinha, quantos germes, quanto dura a maçã, o acaso e o peso dos pontos
  const DIFICULDADES = {
    facil:   { nome: "Fácil", germes: 2, passoG: 330, passoEu: 190, forca: 9, acaso: 0.45, peso: 0.6 },
    normal:  { nome: "Normal", germes: 3, passoG: 260, passoEu: 170, forca: 7, acaso: 0.2, peso: 1 },
    dificil: { nome: "Difícil", germes: 4, passoG: 205, passoEu: 150, forca: 5, acaso: 0.08, peso: 1.5 },
  };
  // Germes de jeitos diferentes: o caçador vai atrás; o andarilho passeia;
  // o esperto mira 4 casas à frente da gotinha (corta o caminho)
  const JEITOS_GERME = ["cacador", "andarilho", "esperto", "cacador"];
  const DIRS = { cima: [0, -1], baixo: [0, 1], esq: [-1, 0], dir: [1, 0] };
  const OPOSTA = { cima: "baixo", baixo: "cima", esq: "dir", dir: "esq" };
  function lerMapa(linhas) {
    const h = linhas.length, w = linhas[0].length, m = { w, h, parede: [], comida: new Map(), inicio: null, germes: [] };
    linhas.forEach((l, y) => [...l].forEach((ch, x) => {
      m.parede[y * w + x] = ch === "#";
      if (ch === ".") m.comida.set(y * w + x, "v");
      if (ch === "o") m.comida.set(y * w + x, "m");
      if (ch === "P") m.inicio = { x, y };
      if (ch === "G") m.germes.push({ x, y });
    }));
    return m;
  }
  const livre = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && !m.parede[y * m.w + x];
  function andar(m, pos, dir) {
    const d = DIRS[dir];
    if (!d) return pos;
    const x = pos.x + d[0], y = pos.y + d[1];
    return livre(m, x, y) ? { x, y } : pos;
  }
  // Distância (em passos) de cada casa até o alvo — o germe segue o mapa.
  function distancias(m, alvo) {
    const dist = new Array(m.w * m.h).fill(Infinity), fila = [alvo];
    dist[alvo.y * m.w + alvo.x] = 0;
    while (fila.length) {
      const c = fila.shift(), dc = dist[c.y * m.w + c.x];
      for (const d of Object.values(DIRS)) {
        const x = c.x + d[0], y = c.y + d[1];
        if (livre(m, x, y) && dist[y * m.w + x] === Infinity) { dist[y * m.w + x] = dc + 1; fila.push({ x, y }); }
      }
    }
    return dist;
  }
  // Próxima direção do germe: não dá meia-volta (só sem saída); com chance
  // `acaso` vira para um lado qualquer; senão chega mais perto (ou foge).
  function passoGerme(m, g, dist, fugindo, acaso, rnd) {
    let ops = Object.keys(DIRS).filter((k) => k !== OPOSTA[g.dir] && livre(m, g.x + DIRS[k][0], g.y + DIRS[k][1]));
    if (!ops.length) ops = Object.keys(DIRS).filter((k) => livre(m, g.x + DIRS[k][0], g.y + DIRS[k][1]));
    if (!ops.length) return g.dir || "cima";
    if (rnd() < acaso) return ops[Math.floor(rnd() * ops.length)];
    const val = (k) => dist[(g.y + DIRS[k][1]) * m.w + g.x + DIRS[k][0]];
    return ops.reduce((a, b) => ((fugindo ? val(b) > val(a) : val(b) < val(a)) ? b : a));
  }
  // Onde o germe mira: o caçador e o andarilho, a gotinha; o esperto, até 4
  // casas à frente dela (a última casa livre no caminho)
  function alvoDoGerme(m, jeito, eu) {
    if (jeito !== "esperto" || !DIRS[eu.dir]) return { x: eu.x, y: eu.y };
    let a = { x: eu.x, y: eu.y };
    for (let k = 0; k < 4; k++) {
      const p = andar(m, a, eu.dir);
      if (p === a) break;
      a = p;
    }
    return a;
  }
  const acasoDoGerme = (jeito, base) => (jeito === "andarilho" ? Math.max(0.6, base) : base);
  const estrelasLabirinto = (p) => (p >= 3000 ? 5 : p >= 2000 ? 4 : p >= 1200 ? 3 : p >= 500 ? 2 : 1);

  const MEDALHAS_NOVAS = {
    relampago: { icone: "⚡", nome: "Raio", como: "Acerte 10 no Relâmpago" },
    saudavel:  { icone: "🍎", nome: "Prato saudável", como: "Faça 300 pontos no Saudável" },
    corpo:     { icone: "🧍", nome: "Anatomista", como: "Monte o corpo inteiro" },
    labirinto: { icone: "💧", nome: "Gotinha esperta", como: "Passe a fase 1 do Labirinto" },
    calma:     { icone: "🌬️", nome: "Calma total", como: "Respire comigo até o fim" },
  };
  Object.assign(J.MEDALHAS, MEDALHAS_NOVAS);

  window.JogosArcade = { ANIMAIS, JEITOS, FEMININOS, apelido, apelidoValido, multiplicador, poolRelampago,
    MINIMO_RELAMPAGO, estrelasRelampago, SAUDAVEIS, EVITAR, ESPECIAIS, velocidadeQueda, intervaloNovo,
    estrelasSaudavel, ZONAS, CORPO_NIVEL, rodadaCorpo, MAPA, MAPA2, mapaDaFase, DIFICULDADES, JEITOS_GERME,
    DIRS, lerMapa, livre, andar, distancias, passoGerme, alvoDoGerme, acasoDoGerme, estrelasLabirinto,
    MEDALHAS_NOVAS };

  // ── Daqui para baixo: a tela (só no navegador) ────────────────────────
  if (typeof document === "undefined" || !window.Jogos || !window.Jogos.kit) return;
  const K = window.Jogos.kit, palco = K.palco, esc = K.esc;
  const vibrar = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  const largura = () => Math.min(palco.clientWidth - 32 || 320, 560);
  const fora = () => document.hidden;          // app em segundo plano: o relógio para
  // "+20" subindo de um ponto da tela
  function subir(texto, el, cor) {
    if (!el) return;
    const r = el.getBoundingClientRect(), f = document.createElement("div");
    f.className = "jg-sobe"; f.textContent = texto; f.style.color = cor || "#16a34a";
    f.style.left = (r.left + r.width / 2) + "px"; f.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }
  const recTxt = (k, un) => (K.recordeDe(k) != null ? `Recorde: ${K.recordeDe(k)}${un || ""}` : "");

  // ── 🏆 Placar da sala de espera ────────────────────────────────────────
  const CHAVE_APELIDO = "jogos-apelido";
  function meuApelido(novo) {
    let a = "";
    try { a = localStorage.getItem(CHAVE_APELIDO) || ""; } catch (e) {}
    if (novo || !apelidoValido(a)) {
      a = apelido(Math.random);
      try { localStorage.setItem(CHAVE_APELIDO, a); } catch (e) {}
    }
    return a;
  }
  function placar(jogo, pontos) {
    const p = K.perfil(), fim = palco.querySelector(".jg-fim");
    if (!fim || !p || !p.codigo || !K.cliente() || !pontos) return;
    fim.insertAdjacentHTML("beforeend", `<div class="jg-placar" id="jg-placar">
      <div class="jg-placar-t">🏆 Placar de hoje da sala de espera</div>
      <div class="jg-placar-ap">Entrar como <b id="jg-apel">${esc(meuApelido())}</b>
        <button type="button" id="jg-apel-troca" aria-label="Sortear outro apelido">🔄</button></div>
      <button type="button" class="jg-seguir" id="jg-placar-entra">Entrar no placar</button>
      <small>Só o apelido e os pontos aparecem na TV da clínica.</small></div>`);
    const caixa = K.q("jg-placar");
    K.q("jg-apel-troca").onclick = () => { K.q("jg-apel").textContent = meuApelido(true); };
    K.q("jg-placar-entra").onclick = async () => {
      const ap = meuApelido();
      caixa.innerHTML = `<div class="jg-placar-t">🏆 Entrando no placar…</div>`;
      try {
        const r = await K.cliente().rpc("registrar_placar", { p_codigo: p.codigo, p_apelido: ap, p_jogo: jogo, p_pontos: Math.round(pontos) });
        if (r.error) throw r.error;
        const { data, error } = await K.cliente().rpc("placar_do_dia", { p_codigo: p.codigo });
        if (error) throw error;
        caixa.innerHTML = `<div class="jg-placar-t">🏆 Placar de hoje${p.nome ? " · " + esc(p.nome) : ""}</div>
          <ol class="jg-top">${(data || []).map((l) => `<li class="${l.apelido === ap ? "eu" : ""}"><b>${esc(l.apelido)}</b><span>${l.pontos}</span></li>`).join("")}</ol>
          ${(data || []).some((l) => l.apelido === ap) ? "<small>Você está no placar! Olhe a TV da sala de espera 📺</small>"
            : "<small>Seus pontos entraram. Jogue de novo para subir! 💪</small>"}`;
        K.contar("placar", null);
      } catch (e) {
        caixa.innerHTML = `<small>O placar não está disponível agora. Tente mais tarde.</small>`;
      }
    };
  }

  // ── ⚡ Relâmpago ────────────────────────────────────────────────────────
  // A resposta certa e a explicação, sem repetir (no "Para que serve" elas
  // são o mesmo texto) e sem ponto dobrado.
  function revisao(p) {
    const certa = String(p.opcoes[p.certa] || "").trim(), ex = String(p.explica || "").trim();
    if (!ex || ex === certa) return esc(certa);
    return esc(certa) + (/[.!?…]$/.test(certa) ? " " : ". ") + esc(ex);
  }
  function relampago() {
    let fila = poolRelampago(K.perfil(), Math.random), i = 0, acertos = 0, combo = 0, pontos = 0, travado = false;
    const erros = [], DURA = 60;
    let resta = DURA, fimJogo = false;
    palco.innerHTML = `<div class="jg-rl-topo"><div class="jg-barra jg-rl-tempo"><i id="jg-rl-t" style="width:100%"></i></div>
      <div class="jg-rl-num"><span id="jg-rl-s">60 s</span><b id="jg-rl-p">0 pts</b><span id="jg-rl-c"></span></div>
      ${K.recordeDe("relampago") != null ? `<div class="jg-passo">${recTxt("relampago", " pts")}</div>` : ""}</div>
      <div id="jg-rl-q"></div>`;
    const relogio = setInterval(() => {
      if (fora()) return;                       // pausa com o app em segundo plano
      resta -= 0.1;
      const t = K.q("jg-rl-t");
      if (t) { t.style.width = Math.max(0, 100 * resta / DURA) + "%"; K.q("jg-rl-s").textContent = Math.ceil(Math.max(0, resta)) + " s"; }
      if (resta <= 0) fim();
    }, 100);
    K.aoParar(() => { clearInterval(relogio); fimJogo = true; });
    const mostrar = () => {
      if (i >= fila.length) { fila = poolRelampago(K.perfil(), Math.random); i = 0; }
      const p = fila[i];
      K.q("jg-rl-q").innerHTML = `<div class="jg-perg">${esc(p.pergunta)}</div>
        <div class="${p.tipo === "mito" ? "jg-vm" : "jg-ops"}">${p.opcoes.map((o, k) => `<button type="button" data-rl="${k}">${esc(o)}</button>`).join("")}</div>`;
      for (const b of palco.querySelectorAll("[data-rl]")) b.onclick = () => responder(+b.dataset.rl);
      travado = false;
    };
    const responder = (k) => {
      if (travado || fimJogo) return;
      travado = true;
      const p = fila[i], certo = k === p.certa;
      if (certo) {
        acertos++; combo++;
        const ganho = 10 * multiplicador(combo);
        pontos += ganho;
        subir("+" + ganho, palco.querySelector(`[data-rl="${k}"]`));
      } else { combo = 0; erros.push(p); vibrar(80); }
      palco.querySelectorAll("[data-rl]").forEach((b, n) => {
        if (n === p.certa) b.classList.add("certa"); else if (n === k) b.classList.add("errada");
      });
      K.q("jg-rl-p").textContent = pontos + " pts";
      const mult = multiplicador(combo);
      K.q("jg-rl-c").textContent = mult > 1 ? "🔥 x" + mult : "";
      setTimeout(() => { if (!fimJogo) { i++; mostrar(); } }, certo ? 350 : 800);
    };
    function fim() {
      if (fimJogo) return;
      K.aoParar(null);
      clearInterval(relogio); fimJogo = true;
      const est = estrelasRelampago(acertos);
      K.ganharEstrelas(est); K.marcar("relampago"); K.contar("relampago", est);
      const nova = acertos >= 10 && K.ganharMedalha("relampago");
      const bateu = K.recorde("relampago", pontos);
      K.resultado(`${acertos} certas · ${pontos} pontos${bateu ? " · novo recorde! 🏆" : ""}`, est, nova ? "relampago" : "", "relampago", pontos);
      placar("relampago", pontos);   // o placar antes da revisão: fica à vista
      const fimEl = palco.querySelector(".jg-fim");
      if (erros.length && fimEl) {
        fimEl.insertAdjacentHTML("beforeend", `<div class="jg-rl-rev"><div class="jg-t">Para aprender</div>${erros.slice(0, 3).map((p) =>
          `<div class="jg-expl"><b>${esc(p.pergunta)}</b><br>${revisao(p)}${p.fonte ? `<small>Fonte: ${esc(p.fonte)}</small>` : ""}</div>`).join("")}</div>`);
      }
    }
    mostrar();
  }

  // ── 🍎 Pegue o saudável ─────────────────────────────────────────────────
  function saudavel() {
    const W = largura(), H = Math.round(Math.min(window.innerHeight * 0.58, 520));
    palco.innerHTML = `<div class="jg-rl-num"><span id="jg-sd-v">❤️❤️❤️</span><b id="jg-sd-p">0 pts</b><span id="jg-sd-s">60 s</span></div>
      <div class="jg-passo">Toque nos alimentos saudáveis. Cuidado com o que faz mal! 💖 dá vida, 🌟 dobra os pontos.${
        K.recordeDe("saudavel") != null ? " " + recTxt("saudavel", " pts") + "." : ""}</div>
      <canvas id="jg-sd" class="jg-canvas" width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas>`;
    const cv = K.q("jg-sd"), g = cv.getContext("2d");
    g.scale(2, 2);
    const itens = [], efeitos = [], ruins = {};
    // tj: o tempo de JOGO (soma dos quadros, com teto) — em segundo plano o
    // navegador para os quadros e o relógio não anda (antes contava o real)
    let vidas = 3, pontos = 0, combo = 0, tj = -ESPERA_INICIO, ult = 0, prox = 0, acabou = false, raf = 0, pisca = 0, dobro = 0;
    const DURA = 60;
    function novo(seg) {
      const x = 26 + Math.random() * (W - 52), sorte = Math.random();
      if (sorte < CHANCE_ESPECIAL) itens.push({ x, y: -24, esp: ESPECIAIS[Math.floor(Math.random() * ESPECIAIS.length)] });
      else if (sorte < 0.35) itens.push({ x, y: -24, ruim: EVITAR[Math.floor(Math.random() * EVITAR.length)] });
      else itens.push({ x, y: -24, e: SAUDAVEIS[Math.floor(Math.random() * SAUDAVEIS.length)] });
      prox = intervaloNovo(seg);
    }
    const emoji = (px) => `${px}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
    function quadro(agora) {
      if (acabou) return;
      const dt = Math.min(0.05, (agora - ult) / 1000);
      ult = agora;
      tj += dt;
      g.clearRect(0, 0, W, H);
      g.textAlign = "center"; g.textBaseline = "middle";
      if (tj < 0) {                                   // 3, 2, 1…
        g.fillStyle = "#0f766e"; g.font = "bold 64px system-ui, sans-serif";
        g.fillText(String(Math.ceil(-tj)), W / 2, H / 2 - 20);
        g.font = "17px system-ui, sans-serif";
        g.fillText("Toque só no que é saudável!", W / 2, H / 2 + 34);
        raf = requestAnimationFrame(quadro);
        return;
      }
      const seg = tj;
      dobro = Math.max(0, dobro - dt);
      prox -= dt * 1000;
      if (prox <= 0) novo(seg);
      const v = velocidadeQueda(seg);
      for (const it of itens) it.y += v * dt;
      for (let k = itens.length - 1; k >= 0; k--) if (itens[k].y > H + 30) {
        if (itens[k].e) combo = 0;       // saudável que passou: perde o combo
        itens.splice(k, 1);
      }
      if (pisca > 0) { g.fillStyle = `rgba(220,38,38,${pisca})`; g.fillRect(0, 0, W, H); pisca = Math.max(0, pisca - dt * 2); }
      if (dobro > 0) { g.fillStyle = "rgba(250,204,21,.16)"; g.fillRect(0, 0, W, H); }
      g.font = emoji(40);
      for (const it of itens) {
        if (it.esp) { g.fillStyle = "rgba(250,204,21,.35)"; g.beginPath(); g.arc(it.x, it.y, 26, 0, 7); g.fill(); }
        g.fillText(it.esp ? it.esp.e : it.ruim ? it.ruim.e : it.e, it.x, it.y);
      }
      g.font = "bold 18px system-ui, sans-serif";
      for (let k = efeitos.length - 1; k >= 0; k--) {
        const f = efeitos[k];
        f.vida -= dt;
        if (f.vida <= 0) { efeitos.splice(k, 1); continue; }
        g.globalAlpha = Math.min(1, f.vida * 2); g.fillStyle = f.cor; g.fillText(f.t, f.x, f.y - (0.8 - f.vida) * 40); g.globalAlpha = 1;
      }
      if (dobro > 0) { g.fillStyle = "#a16207"; g.fillText(`🌟 pontos em dobro: ${Math.ceil(dobro)} s`, W / 2, 18); }
      const resta = Math.max(0, Math.ceil(DURA - seg));
      K.q("jg-sd-s").textContent = resta + " s";
      if (resta <= 0) return fim();
      raf = requestAnimationFrame(quadro);
    }
    const pintarVidas = () => { K.q("jg-sd-v").textContent = "❤️".repeat(vidas) + "🤍".repeat(Math.max(0, 3 - vidas)); };
    cv.addEventListener("pointerdown", (ev) => {
      if (acabou || tj < 0) return;
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      let melhor = -1, dm = 38;
      itens.forEach((it, k) => { const d = Math.hypot(it.x - x, it.y - y); if (d < dm) { dm = d; melhor = k; } });
      if (melhor < 0) return;
      const it = itens.splice(melhor, 1)[0];
      if (it.ruim) {
        vidas--; combo = 0; pisca = 0.35; vibrar(120);
        ruins[it.ruim.e] = (ruins[it.ruim.e] || 0) + 1;
        efeitos.push({ x: it.x, y: it.y, t: "✗ " + it.ruim.nome, cor: "#dc2626", vida: 0.8 });
        pintarVidas();
        if (vidas <= 0) return fim();
      } else if (it.esp) {
        vibrar(30);
        if (it.esp.esp === "vida" && vidas < 3) { vidas++; pintarVidas(); efeitos.push({ x: it.x, y: it.y, t: "+1 vida", cor: "#db2777", vida: 0.8 }); }
        else if (it.esp.esp === "vida") { pontos += 30; efeitos.push({ x: it.x, y: it.y, t: "+30", cor: "#db2777", vida: 0.8 }); }
        else { dobro = 5; efeitos.push({ x: it.x, y: it.y, t: "x2!", cor: "#a16207", vida: 0.8 }); }
      } else {
        combo++;
        const ganho = 10 * multiplicador(combo) * (dobro > 0 ? 2 : 1);
        pontos += ganho;
        efeitos.push({ x: it.x, y: it.y, t: "+" + ganho, cor: "#16a34a", vida: 0.8 });
      }
      K.q("jg-sd-p").textContent = pontos + " pts";
    });
    function fim() {
      if (acabou) return;
      acabou = true; cancelAnimationFrame(raf); K.aoParar(null);
      const est = estrelasSaudavel(pontos);
      K.ganharEstrelas(est); K.marcar("saudavel"); K.contar("saudavel", est);
      const nova = pontos >= 300 && K.ganharMedalha("saudavel");
      const bateu = K.recorde("saudavel", pontos);
      K.resultado(`${pontos} pontos${bateu ? " · novo recorde! 🏆" : ""}`, est, nova ? "saudavel" : "", "saudavel", pontos);
      placar("saudavel", pontos);
      const pior = Object.entries(ruins).sort((a, b) => b[1] - a[1])[0];
      const d = pior ? EVITAR.find((x) => x.e === pior[0]) : EVITAR[Math.floor(Math.random() * EVITAR.length)];
      palco.querySelector(".jg-fim").insertAdjacentHTML("beforeend",
        `<div class="jg-expl"><b>${d.e} ${esc(d.nome)}:</b> ${esc(d.dica)}<small>Fonte: ${esc(d.fonte)}</small></div>`);
    }
    K.aoParar(() => { acabou = true; cancelAnimationFrame(raf); });
    raf = requestAnimationFrame((t) => { ult = t; quadro(t); });
  }

  // ── 🧍 Monte o corpo ────────────────────────────────────────────────────
  function corpo() {
    const nivel = Math.min(3, Math.max(1, K.ler().corpoNivel || 1)), cfg = CORPO_NIVEL[nivel - 1];
    const rodada = rodadaCorpo(K.perfil(), Math.random, cfg.n);
    let escolhido = null, colocados = 0, erros = 0;
    const zonasUsadas = Object.entries(ZONAS);
    palco.innerHTML = `<div class="jg-passo"><b>Nível ${nivel}</b>${cfg.icones ? "" : " (sem as figuras)"} · arraste cada exame até a parte do corpo que ele avalia (ou toque no exame e depois no lugar).</div>
      <div class="jg-corpo">
        <svg viewBox="0 0 200 320" class="jg-silhueta" aria-hidden="true">
          <g fill="#dbeafe" stroke="#93c5fd" stroke-width="2">
            <circle cx="100" cy="56" r="40"/>
            <rect x="88" y="94" width="24" height="16" rx="6"/>
            <rect x="58" y="106" width="84" height="122" rx="26"/>
            <rect x="28" y="112" width="24" height="98" rx="12" transform="rotate(8 40 112)"/>
            <rect x="148" y="112" width="24" height="98" rx="12" transform="rotate(-8 160 112)"/>
            <rect x="66" y="218" width="28" height="94" rx="13"/>
            <rect x="106" y="218" width="28" height="94" rx="13"/>
          </g>
          ${zonasUsadas.map(([k, z]) => `<g class="jg-zona" data-zona="${k}"><circle cx="${z.x}" cy="${z.y}" r="12"/>
            <text x="${z.x}" y="${z.y + 1}" text-anchor="middle" dominant-baseline="middle">${cfg.icones ? z.ic : ""}</text></g>`).join("")}
        </svg>
      </div>
      <div class="jg-fichas">${rodada.map((r, k) => `<button type="button" class="jg-ficha" data-f="${k}">${esc(r.exame)}</button>`).join("")}</div>
      <div id="jg-resp"></div>`;
    const resp = K.q("jg-resp");
    const marcar = (b) => {
      palco.querySelectorAll(".jg-ficha").forEach((x) => x.classList.toggle("sel", x === b));
      escolhido = b;
      palco.querySelector(".jg-corpo").classList.toggle("alvo", !!b);
    };
    function soltar(b, zona) {
      const r = rodada[+b.dataset.f];
      if (!zona) return;
      const z = ZONAS[zona], certo = zona === r.area;
      const el = palco.querySelector(`[data-zona="${zona}"]`);
      if (certo) {
        b.remove(); colocados++; marcar(null);
        el.classList.add("certa");
        el.querySelector("text").textContent = z.ic;          // a figura aparece ao acertar
        resp.innerHTML = `<div class="jg-expl ok"><b>${z.ic} ${esc(r.exame)} (${esc(z.nome.toLowerCase())}):</b> ${esc(r.oque)}</div>`;
        if (colocados === rodada.length) setTimeout(fim, 1100);
      } else {
        erros++; vibrar(80);
        el.classList.add("errada"); setTimeout(() => el.classList.remove("errada"), 600);
        resp.innerHTML = `<div class="jg-expl">Aí não: ${esc(z.nome.toLowerCase())}. Tente outro lugar! 😉</div>`;
      }
    }
    // Arrastar (pointer) ou tocar e tocar
    let arr = null;
    for (const b of palco.querySelectorAll(".jg-ficha")) {
      b.addEventListener("pointerdown", (ev) => {
        arr = { b, x0: ev.clientX, y0: ev.clientY, fantasma: null };
        try { b.setPointerCapture(ev.pointerId); } catch (e) {}
      });
      b.addEventListener("pointermove", (ev) => {
        if (!arr || arr.b !== b) return;
        if (!arr.fantasma && Math.hypot(ev.clientX - arr.x0, ev.clientY - arr.y0) > 10) {
          arr.fantasma = b.cloneNode(true); arr.fantasma.classList.add("jg-fantasma");
          document.body.appendChild(arr.fantasma); marcar(b);
        }
        if (arr.fantasma) { arr.fantasma.style.left = ev.clientX + "px"; arr.fantasma.style.top = ev.clientY + "px"; }
      });
      b.addEventListener("pointerup", (ev) => {
        if (!arr || arr.b !== b) return;
        const f = arr.fantasma;
        arr = null;
        if (!f) return marcar(escolhido === b ? null : b);
        f.remove();
        const alvo = document.elementFromPoint(ev.clientX, ev.clientY);
        const zona = alvo && alvo.closest && alvo.closest("[data-zona]");
        if (zona) soltar(b, zona.dataset.zona); else marcar(null);
      });
      b.addEventListener("pointercancel", () => { if (arr && arr.fantasma) arr.fantasma.remove(); arr = null; });
    }
    for (const z of palco.querySelectorAll("[data-zona]")) z.addEventListener("click", () => { if (escolhido) soltar(escolhido, z.dataset.zona); });
    K.aoParar(() => { document.querySelectorAll(".jg-fantasma").forEach((x) => x.remove()); });
    function fim() {
      K.aoParar(null);
      const est = Math.max(2, 5 - erros);
      K.ganharEstrelas(est); K.marcar("corpo"); K.contar("corpo", est);
      const sobe = erros <= 1 && nivel < 3;
      if (sobe) { const d = K.ler(); d.corpoNivel = nivel + 1; K.gravar(d); }
      K.recorde("corpo", nivel);
      const nova = K.ganharMedalha("corpo");
      K.resultado((erros ? `Nível ${nivel}: corpo montado com ${erros} ${erros === 1 ? "erro" : "erros"}` : `Nível ${nivel}: corpo montado sem errar!`)
        + (sobe ? ` · próximo: nível ${nivel + 1}` : ""), est, nova ? "corpo" : "", "corpo", 1);
    }
  }

  // ── 💧 Labirinto ────────────────────────────────────────────────────────
  // Antes de jogar, a dificuldade (o controle de velocidade); fica guardada.
  function labirinto() {
    const atual = K.ler().labDif || "normal";
    palco.innerHTML = `<div class="jg-perg">💧 Labirinto</div>
      <div class="jg-passo">Coma as vitaminas e fuja dos germes 🦠. A maçã 🍎 deixa os germes fracos — aí é você quem pega!</div>
      <div class="jg-t">Escolha a velocidade</div>
      <div class="jg-ops">${Object.entries(DIFICULDADES).map(([k, d]) =>
        `<button type="button" data-dif="${k}" class="${k === atual ? "sel" : ""}"><b>${{ facil: "🐢", normal: "🚶", dificil: "🚀" }[k]} ${d.nome}</b>
          <small>${d.germes} germes${k === "facil" ? ", mais devagar" : k === "dificil" ? ", bem rápidos (pontos x1,5)" : ""}${
            K.recordeDe("labirinto_" + k) != null ? " · recorde " + K.recordeDe("labirinto_" + k) : ""}</small></button>`).join("")}</div>`;
    for (const b of palco.querySelectorAll("[data-dif]")) b.onclick = () => {
      const d = K.ler(); d.labDif = b.dataset.dif; K.gravar(d);
      jogarLabirinto(b.dataset.dif);
    };
  }

  function jogarLabirinto(difId) {
    const DIF = DIFICULDADES[difId] || DIFICULDADES.normal;
    const L = largura(), CEL = Math.floor(Math.min(L, 420) / 15), W = CEL * 15, H = CEL * 15;
    palco.innerHTML = `<div class="jg-rl-num"><span id="jg-lb-v">💧💧💧</span><b id="jg-lb-p">0 pts</b><span id="jg-lb-f">${DIF.nome} · Fase 1</span></div>
      <canvas id="jg-lb" class="jg-canvas jg-lb" width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas>
      <div class="jg-pad">${["cima", "esq", "dir", "baixo"].map((d) =>
        `<button type="button" data-d="${d}" aria-label="${d}">${{ cima: "▲", esq: "◀", dir: "▶", baixo: "▼" }[d]}</button>`).join("")}</div>
      <div class="jg-fim-bts"><button type="button" id="jg-lb-pausa" class="jg-menu jg-pausa">⏸ Pausar</button></div>
      <div class="jg-passo" id="jg-lb-msg">Coma as vitaminas e fuja dos germes 🦠. A maçã 🍎 deixa os germes fracos!</div>`;
    const cv = K.q("jg-lb"), g = cv.getContext("2d");
    g.scale(2, 2);
    let m, eu, germes, fase = 1, vidas = 3, pontos = 0, querer = "esq", forca = 0, pausa = 1.2, acabou = false, raf = 0, ult = 0;
    let accEu = 0, accG = 0, pausado = false, medalhaNova = false;
    const ganhar = (n) => { pontos += Math.round(n * DIF.peso); };
    const passoEu = () => Math.max(110, DIF.passoEu - 8 * (fase - 1));
    const passoG = () => Math.max(140, DIF.passoG - 25 * (fase - 1));
    function montar(novoMapa) {
      if (novoMapa) m = lerMapa(mapaDaFase(fase));
      eu = { ...m.inicio, ax: m.inicio.x, ay: m.inicio.y, dir: "esq" };
      const casas = [...m.germes, { x: 7, y: 3 }].slice(0, DIF.germes);
      germes = casas.map((p, k) => ({ ...p, ax: p.x, ay: p.y, dir: "cima", casa: { ...p }, preso: 1 + k * 1.5,
                                      jeito: JEITOS_GERME[k % JEITOS_GERME.length] }));
      accEu = accG = 0; forca = 0; pausa = 1.2;
    }
    montar(true);
    function colisao() {
      for (const gm of germes) {
        // mesma casa, ou se cruzaram no caminho (trocaram de casa)
        const junto = (gm.x === eu.x && gm.y === eu.y)
          || (gm.ax === eu.x && gm.ay === eu.y && gm.x === eu.ax && gm.y === eu.ay);
        if (gm.preso > 0 || !junto) continue;
        if (forca > 0) {
          ganhar(200); vibrar(40);
          Object.assign(gm, { x: gm.casa.x, y: gm.casa.y, ax: gm.casa.x, ay: gm.casa.y, preso: 3 });
        } else {
          vidas--; vibrar(200);
          K.q("jg-lb-v").textContent = "💧".repeat(Math.max(0, vidas)) + "🤍".repeat(3 - Math.max(0, vidas));
          if (vidas <= 0) return fim();
          K.q("jg-lb-msg").textContent = "Ops! Um germe te pegou. Cuidado! 🦠";
          montar(false);
          return;
        }
      }
    }
    function comer() {
      const k = eu.y * m.w + eu.x, c = m.comida.get(k);
      if (!c) return;
      m.comida.delete(k);
      if (c === "v") ganhar(10);
      else { ganhar(50); forca = Math.max(3, DIF.forca - (fase - 1)); K.q("jg-lb-msg").textContent = "🍎 Germes fracos! Pegue eles!"; }
      if (!m.comida.size) {
        if (fase === 1 && K.ganharMedalha("labirinto")) medalhaNova = true;
        fase++; ganhar(500);
        K.q("jg-lb-f").textContent = `${DIF.nome} · Fase ${fase}`;
        K.q("jg-lb-msg").textContent = `Fase ${fase}! Labirinto novo e germes mais rápidos. 💪`;
        montar(true);
      }
    }
    function quadro(agora) {
      if (acabou) return;
      const dt = Math.min(0.05, (agora - ult) / 1000 || 0);
      ult = agora;
      if (pausado || fora()) { desenhar(1, 1); raf = requestAnimationFrame(quadro); return; }
      if (pausa > 0) pausa -= dt;
      else {
        forca = Math.max(0, forca - dt);
        accEu += dt * 1000;
        if (accEu >= passoEu()) {
          accEu = 0; eu.ax = eu.x; eu.ay = eu.y;
          const tenta = andar(m, eu, querer);
          if (tenta !== eu) { eu.dir = querer; Object.assign(eu, tenta); }
          else Object.assign(eu, andar(m, eu, eu.dir));
          comer(); colisao();
        }
        accG += dt * 1000;
        const pg = forca > 0 ? passoG() * 1.6 : passoG();
        if (accG >= pg && !acabou) {
          accG = 0;
          for (const gm of germes) {
            gm.ax = gm.x; gm.ay = gm.y;
            if (gm.preso > 0) continue;
            const dist = distancias(m, alvoDoGerme(m, gm.jeito, eu));
            gm.dir = passoGerme(m, gm, dist, forca > 0, acasoDoGerme(gm.jeito, DIF.acaso), Math.random);
            Object.assign(gm, andar(m, gm, gm.dir));
          }
          colisao();
        }
        for (const gm of germes) if (gm.preso > 0) gm.preso -= dt;
      }
      if (acabou) return;
      desenhar(Math.min(1, accEu / passoEu()), Math.min(1, accG / passoG()));
      K.q("jg-lb-p").textContent = pontos + " pts";
      raf = requestAnimationFrame(quadro);
    }
    const ANEL = { cacador: "#f87171", andarilho: "#facc15", esperto: "#c084fc" };
    function desenhar(fe, fg) {
      g.fillStyle = "#0b2530"; g.fillRect(0, 0, W, H);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (!m.parede[y * m.w + x]) continue;
        g.fillStyle = "#14596b"; g.beginPath();
        if (g.roundRect) g.roundRect(x * CEL + 1, y * CEL + 1, CEL - 2, CEL - 2, CEL * 0.25); else g.rect(x * CEL + 1, y * CEL + 1, CEL - 2, CEL - 2);
        g.fill();
      }
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const [k, c] of m.comida) {
        const x = (k % m.w) * CEL + CEL / 2, y = Math.floor(k / m.w) * CEL + CEL / 2;
        if (c === "v") { g.fillStyle = "#ffd166"; g.beginPath(); g.arc(x, y, CEL * 0.12, 0, 7); g.fill(); }
        else { g.font = `${CEL * 0.8}px system-ui, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`; g.fillText("🍎", x, y + 1); }
      }
      const pos = (o, f) => [(o.ax + (o.x - o.ax) * f) * CEL + CEL / 2, (o.ay + (o.y - o.ay) * f) * CEL + CEL / 2];
      g.font = `${CEL * 0.85}px system-ui, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`;
      for (const gm of germes) {
        const [x, y] = pos(gm, fg);
        g.globalAlpha = gm.preso > 0 ? 0.35 : 1;
        if (forca > 0 && gm.preso <= 0) {
          g.fillStyle = forca < 1.5 && Math.floor(forca * 6) % 2 ? "#ffffff" : "#60a5fa";
          g.beginPath(); g.arc(x, y, CEL * 0.48, 0, 7); g.fill();
        } else {
          g.strokeStyle = ANEL[gm.jeito] || "#f87171"; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, CEL * 0.46, 0, 7); g.stroke();
        }
        g.fillText("🦠", x, y + 1);
        g.globalAlpha = 1;
      }
      // A gotinha (desenho nosso): gota vermelha com olhinhos
      const [x, y] = pos(eu, fe), r = CEL * 0.36;
      g.fillStyle = "#e11d48"; g.beginPath();
      g.moveTo(x, y - r * 1.55);
      g.quadraticCurveTo(x + r * 1.05, y - r * 0.2, x + r, y + r * 0.2);
      g.arc(x, y + r * 0.2, r, 0, Math.PI);
      g.quadraticCurveTo(x - r * 1.05, y - r * 0.2, x, y - r * 1.55);
      g.fill();
      g.fillStyle = "#fff";
      const olho = { dir: [1, 0], esq: [-1, 0], cima: [0, -1], baixo: [0, 1] }[eu.dir] || [0, 0];
      for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.38, y + r * 0.05, r * 0.24, 0, 7); g.fill(); }
      g.fillStyle = "#0b2530";
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(x + s * r * 0.38 + olho[0] * r * 0.1, y + r * 0.05 + olho[1] * r * 0.1, r * 0.12, 0, 7); g.fill();
      }
      if (pausado || fora()) {
        g.fillStyle = "rgba(11,37,48,.7)"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#fff"; g.font = "bold 26px system-ui, sans-serif"; g.fillText("Pausado", W / 2, H / 2);
        g.font = "15px system-ui, sans-serif"; g.fillText("Toque no labirinto para continuar", W / 2, H / 2 + 30);
      }
    }
    // Controles: botões, deslizar no labirinto e as setas do teclado
    for (const b of palco.querySelectorAll("[data-d]")) b.addEventListener("pointerdown", (e) => { e.preventDefault(); querer = b.dataset.d; });
    const bPausa = K.q("jg-lb-pausa");
    const alternar = () => { pausado = !pausado; bPausa.textContent = pausado ? "▶ Continuar" : "⏸ Pausar"; };
    bPausa.onclick = alternar;
    // ao voltar do segundo plano, fica pausado até a pessoa tocar
    const aoVoltar = () => { if (document.hidden && !pausado) alternar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    let ini = null;
    cv.addEventListener("pointerdown", (e) => { if (pausado) { alternar(); return; } ini = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener("pointermove", (e) => {
      if (!ini) return;
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      querer = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "dir" : "esq") : (dy > 0 ? "baixo" : "cima");
      ini = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener("pointerup", () => { ini = null; });
    const tecla = (e) => {
      const d = { ArrowUp: "cima", ArrowDown: "baixo", ArrowLeft: "esq", ArrowRight: "dir" }[e.key];
      if (d) { querer = d; e.preventDefault(); }
      if (e.key === " " || e.key === "p") { alternar(); e.preventDefault(); }
    };
    document.addEventListener("keydown", tecla);
    const soltar = () => { document.removeEventListener("keydown", tecla); document.removeEventListener("visibilitychange", aoVoltar); };
    function fim() {
      if (acabou) return;
      acabou = true; cancelAnimationFrame(raf); soltar(); K.aoParar(null);
      const est = estrelasLabirinto(pontos);
      K.ganharEstrelas(est); K.marcar("labirinto"); K.contar("labirinto", est);
      const bateu = K.recorde("labirinto_" + difId, pontos);
      K.recorde("labirinto", pontos);
      K.resultado(`${pontos} pontos · ${DIF.nome} · fase ${fase}${bateu ? " · novo recorde! 🏆" : ""}`, est, medalhaNova ? "labirinto" : "", "labirinto", pontos);
      placar("labirinto", pontos);
      palco.querySelector(".jg-fim").insertAdjacentHTML("beforeend", `<div class="jg-expl"><b>🧼 Contra os germes de verdade:</b>
        lavar bem as mãos com água e sabão (palmas, dorso, entre os dedos e as unhas) é uma das formas mais simples de evitar infecções.
        <small>Fonte: Ministério da Saúde</small></div>`);
    }
    K.aoParar(() => { acabou = true; cancelAnimationFrame(raf); soltar(); });
    raf = requestAnimationFrame((t) => { ult = t; quadro(t); });
  }

  // ── 🌬️ Respire comigo ──────────────────────────────────────────────────
  // Respiração quadrada (4 s cada fase). 1 minuto = 4 ciclos; 3 minutos = 11.
  // Vibra de leve a cada troca, para quem prefere de olhos fechados.
  function respire() {
    const FASES = [["Inspire pelo nariz", 1.0], ["Segure", 1.0], ["Solte devagar", 0.55], ["Descanse", 0.55]];
    const SEG = 4;
    palco.innerHTML = `<div class="jg-resp-caixa">
        <div class="jg-resp-bola" id="jg-rb"><span id="jg-rn">🌿</span></div>
        <div class="jg-resp-txt" id="jg-rt">Um tempo para respirar com calma. Sente-se confortável.</div>
        <div class="jg-passo" id="jg-rc">O celular vibra de leve a cada troca — dá para fazer de olhos fechados.</div>
        <div class="jg-fim-bts" id="jg-r-bts"><button type="button" class="jg-seguir" data-min="1">1 minuto</button>
          <button type="button" class="jg-menu" data-min="3">3 minutos</button></div>
      </div>`;
    let timer = 0;
    K.aoParar(() => clearTimeout(timer));
    for (const b of palco.querySelectorAll("[data-min]")) b.onclick = () => comecar(b.dataset.min === "3" ? 11 : 4);
    function comecar(ciclos) {
      K.q("jg-r-bts").remove();
      let passo = 0;
      const total = ciclos * FASES.length;
      const rodar = () => {
        if (passo >= total) return fim(ciclos);
        const [txt, escala] = FASES[passo % FASES.length];
        K.q("jg-rt").textContent = txt;
        K.q("jg-rc").textContent = `Respiração ${Math.floor(passo / FASES.length) + 1} de ${ciclos}`;
        vibrar(passo % FASES.length === 0 ? [60, 80, 60] : 40);
        const bola = K.q("jg-rb");
        bola.style.transition = `transform ${SEG}s ease-in-out`;
        bola.style.transform = `scale(${escala})`;
        let n = SEG;
        K.q("jg-rn").textContent = n;
        const conta = () => {
          if (fora()) { timer = setTimeout(conta, 500); return; }   // pausa em segundo plano
          n--;
          if (n <= 0) { passo++; rodar(); return; }
          K.q("jg-rn").textContent = n;
          timer = setTimeout(conta, 1000);
        };
        timer = setTimeout(conta, 1000);
      };
      rodar();
    }
    function fim(ciclos) {
      K.aoParar(null);
      const est = ciclos > 4 ? 5 : 3;
      K.ganharEstrelas(est); K.marcar("respira"); K.contar("respira", est);
      const nova = K.ganharMedalha("calma");
      K.resultado(`Muito bem! Você respirou com calma por ${ciclos > 4 ? "3 minutos" : "um minuto"}. 🌿`, est, nova ? "calma" : "", "respire");
    }
  }

  const R = window.Jogos.registrar;
  const sub = (padrao, k, un) => () => (K.recordeDe(k) != null ? `${padrao} · recorde ${K.recordeDe(k)}${un}` : padrao);
  R("relampago", { icone: "⚡", nome: "Relâmpago", sub: sub("60 s, acerte o máximo!", "relampago", " pts"), abrir: relampago });
  R("saudavel", { icone: "🍎", nome: "Pegue o saudável", sub: sub("Toque nos alimentos bons", "saudavel", " pts"), abrir: saudavel });
  R("labirinto", { icone: "💧", nome: "Labirinto", sub: sub("Fuja dos germes · 3 velocidades", "labirinto", " pts"), abrir: labirinto });
  R("corpo", { icone: "🧍", nome: "Monte o corpo",
               sub: () => `Nível ${Math.min(3, Math.max(1, K.ler().corpoNivel || 1))} · cada exame no seu lugar`, abrir: corpo });
  R("respire", { icone: "🌬️", nome: "Respire comigo", sub: "1 ou 3 minutos de calma", abrir: respire });
})();
