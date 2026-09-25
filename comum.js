/* ═══════════════════════════════════════════════════════════════════════
   O que as DUAS paginas compartilham: rotulos, a tabela que diz em que
   parte do corpo cada documento entra, e o captcha.

   Existe como arquivo separado por um motivo so, e ele nao e economia de
   linhas: a tabela de palavras-chave e conhecimento medico, e duas copias
   dela divergem. Bastaria alguem acrescentar "troponina" no aplicativo do
   paciente e esquecer da pagina do medico para o mesmo exame cair no peito
   num lugar e em lugar nenhum no outro — e ninguem perceberia, porque as
   duas telas passariam a mostrar coisas diferentes sem erro nenhum.

   Carregado ANTES de app.js e de medico.js, que so consomem.
   ═══════════════════════════════════════════════════════════════════════ */
const ROTULOS = { exame: "Exame", laudo: "Laudo", receita: "Receita",
                  relatorio: "Relatório", outro: "Documento" };
const ICONES = { exame: "🧪", laudo: "📄", receita: "💊",
                 relatorio: "📋", outro: "📎" };

// A faixa U+0300 a U+036F sao os acentos que o NFD separa da letra.
// Montada com fromCharCode e nao escrita direto no regex: esses
// caracteres nao tem desenho proprio, e ficariam invisiveis para quem
// ler o codigo depois — um intervalo que parece vazio e nao esta.
const ACENTOS = new RegExp("[" + String.fromCharCode(0x0300) + "-"
                              + String.fromCharCode(0x036F) + "]", "g");
function semAcento(t) {
  return String(t || "").normalize("NFD").replace(ACENTOS, "").toLowerCase();
}

/* ── Texto de gente dentro de innerHTML ───────────────────────────────────
   As duas telas montam cartao com template string e `innerHTML`, e o que
   entra ali NAO e so texto do codigo: e o nome que o paciente digitou, o
   que ele procurou na busca, e — na lista de "quem abriu meu acervo" — o
   nome que o MEDICO digitou do outro lado. Esse ultimo nao e nem do dono
   da tela: quem tem o codigo de seis digitos escolhe a string que vai
   parar dentro do aplicativo do paciente.

   Sem escapar, um nome com "<" ja quebra a linha em silencio (o navegador
   le como tag e engole o resto), e um nome montado de proposito executa
   script na origem do app — onde mora a sessao do Supabase do paciente.
   Nao e hipotese distante: e o unico campo do modulo em que uma pessoa
   escreve texto que OUTRA le.

   Aqui, e nao em cada chamada: as duas paginas compartilham este arquivo
   pelo mesmo motivo da tabela de palavras-chave — duas copias divergem, e
   a que ficar para tras vira a brecha. */
function escaparHTML(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ═══ O BONECO ═══════════════════════════════════════════════════════════
   Mora AQUI, e nao no HTML de cada pagina, pelo mesmo motivo da tabela de
   palavras-chave la em cima: duas copias divergem. E divergiram — a tela do
   medico ficou meses com a pelve em trapezio reto e as duas pernas num
   poligono so, enquanto a do paciente recebeu sete commits de desenho. O
   paciente e o medico olhavam corpos diferentes para o mesmo acervo.

   PROPORCAO. A figura tem 234 unidades de altura (y 2 a 236) e a perna
   comeca na virilha, em y=133: 44% do corpo. O canone de desenho manda 53%,
   e a diferenca nao e desleixo, e o piso de toque: peito, abdome e pelve
   sao TRES alvos empilhados, e cada um precisa de 44px de altura para o
   polegar acertar de primeira. A 164px de largura isso custa 27 unidades
   cada. Encurtar o tronco alem disto quebraria o teste — e com razao.

   O QUE O DESENHO ANTIGO ERRAVA, e que se via de longe:

   - A PERNA AFINAVA AO CONTRARIO. Era 11,5 de largura na coxa e 13 no
     joelho: mais grossa embaixo. Agora sai de 19 na coxa para 11 no
     tornozelo, que e o sentido em que perna nenhuma discorda.
   - A VIRILHA PENDIA. A pelve descia num "U" ate y=144, abaixo do topo das
     pernas — lia-se como fralda. Agora e um entalhe para CIMA entre as duas
     coxas, que e o que a virilha e.
   - O QUADRIL NAO ALARGAVA. O comentario antigo prometia "alarga para 52,
     mais larga que a propria barriga", e dois commits de ajuste tinham
     deixado a pelve em 42 contra 38 da cintura: quatro unidades, invisiveis.
     Agora a cintura fecha em 40 e o quadril abre para 52 — o alargamento e o
     sinal anatomico mais forte de "isto e quadril", e ou ele se ve, ou nao
     esta la.
   - A MAO PARAVA NO QUADRIL. Agora desce ate a meia-coxa, que e onde a mao
     de gente para.

   Os retangulos `alcance` sao transparentes e existem so para o dedo: braco
   e perna de pictograma sao finos demais para 44px, e engrossa-los estragaria
   o desenho. Ver o comentario de `.regiao.alcance` no CSS.                  */
const CORPO_SVG = `
  <g class="silhueta" aria-hidden="true">
    <path d="M44 27 h12 v14 h-12 Z"/>
  </g>
  <path class="regiao" data-regiao="cabeca" tabindex="0" role="button"
        aria-label="Cabeça: crânio, olhos e ouvidos"
        d="M50 2 A15 15 0 0 1 50 32 A15 15 0 0 1 50 2 Z"/>
  <path class="regiao" data-regiao="peito" tabindex="0" role="button"
        aria-label="Tórax: coração, pulmões e mamas"
        d="M34 41 h32 l10 10 v24 h-52 v-24 Z"/>
  <path class="regiao" data-regiao="barriga" tabindex="0" role="button"
        aria-label="Abdome: fígado, estômago, intestino e rins"
        d="M24 75 h52 l-6 28 h-40 Z"/>
  <path class="regiao" data-regiao="pelve" tabindex="0" role="button"
        aria-label="Pelve: bexiga, próstata, útero e ovários"
        d="M30 103 Q24 109 24 117 Q24 126 27 133
           L46 133 Q50 128 54 133
           L73 133 Q76 126 76 117 Q76 109 70 103 Z"/>
  <path class="regiao" data-regiao="pernas" tabindex="0" role="button"
        aria-label="Pernas: joelhos, tornozelos, pés e circulação"
        d="M27 133 L26 160 L29 184 L30 210 L31 236 L40 236 L41 210 L42 184 L45 160 L46 133 Z"/>
  <path class="regiao" data-regiao="pernas" tabindex="-1" aria-hidden="true"
        d="M73 133 L74 160 L71 184 L70 210 L69 236 L60 236 L59 210 L58 184 L55 160 L54 133 Z"/>
  <path class="regiao" data-regiao="bracos" tabindex="0" role="button"
        aria-label="Braços: ombros, cotovelos, punhos e mãos"
        d="M24 52 L19 59 L16 104 L15 150 L22 151 L22 105 L24 62 Z"/>
  <path class="regiao" data-regiao="bracos" tabindex="-1" aria-hidden="true"
        d="M76 52 L81 59 L84 104 L85 150 L78 151 L78 105 L76 62 Z"/>
  <rect class="regiao alcance" data-regiao="bracos" aria-hidden="true"
        x="1" y="47" width="23" height="116"/>
  <rect class="regiao alcance" data-regiao="bracos" aria-hidden="true"
        x="76" y="47" width="23" height="116"/>
  <rect class="regiao alcance" data-regiao="pernas" aria-hidden="true"
        x="24" y="135" width="22" height="103"/>
  <rect class="regiao alcance" data-regiao="pernas" aria-hidden="true"
        x="54" y="135" width="22" height="103"/>
  <g id="corpo-bolhas" aria-hidden="true"></g>
`;

/* Desenha assim que o arquivo carrega. As duas paginas deixam o <svg> vazio
   no HTML, com o viewBox e o aria-label proprios de cada uma, e o conteudo
   entra aqui — e por isso nao ha como uma delas ficar para tras. */
(function montarCorpo() {
  const svg = typeof document !== "undefined" && document.getElementById("corpo");
  if (svg) svg.innerHTML = CORPO_SVG;
})();


/* ═══ Datas ══════════════════════════════════════════════════════════════
   DUAS COISAS DIFERENTES chegam aqui como texto, e tratá-las igual foi o
   defeito:

     "2026-02-04"                 data PURA — dia, sem hora e sem fuso
     "2026-02-04T23:30:00+00:00"  INSTANTE — tem hora, e hora tem fuso

   `data_documento` é do primeiro tipo; `criado_em` é do segundo, e o
   aplicativo cai nele quando a pessoa não informa a data.

   Cortar os 10 primeiros caracteres funciona para o primeiro e ERRA para o
   segundo: o instante é gravado em UTC, e das 21h de Brasília em diante o
   UTC já virou o dia seguinte. Um documento fotografado às 22h de 18/09
   aparecia como 19/09.

   E converter o PRIMEIRO com `new Date()` erra para o outro lado: a data
   pura é lida como meia-noite UTC, que em Brasília é o dia ANTERIOR — o
   exame de 04/02 viraria 03/02. Por isso os dois casos são separados aqui,
   e não "resolvidos" por uma conversão só.

   A agenda já fazia isto certo (`hojeISO`, com o mesmo comentário). Os
   documentos não — e ninguém nota, porque o erro só aparece depois das 21h.
   ═══════════════════════════════════════════════════════════════════════ */

/* Hoje, no fuso de quem está olhando. Nunca `toISOString()`, que é UTC. */
function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* O DIA de um instante, no fuso de quem está olhando. */
function diaLocalDe(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* AAAA-MM-DD para o dia certo, seja data pura ou instante. */
function diaDoDocumento(d) {
  const t = String((d && (d.data_documento || d.criado_em)) || "");
  if (!t) return "";
  return t.length <= 10 ? t.slice(0, 10) : diaLocalDe(t);
}

function dataBR(iso, vazio) {
  const t = String(iso || "");
  if (!t) return vazio === undefined ? "sem data" : vazio;
  const dia = t.length <= 10 ? t.slice(0, 10) : diaLocalDe(t);
  const [a, m, d] = dia.split("-");
  if (!a || !m || !d) return vazio === undefined ? "sem data" : vazio;
  return `${d}/${m}/${a}`;
}

/* O que cada documento oferece a busca. O rotulo do tipo entra para que
   "receita" funcione sem descobrir o seletor, e a data no formato BRASILEIRO
   para que "02/2026" e "2026" achem — e a data que a pessoa lembra. */
function textoBuscavel(d) {
  return semAcento([
    d.nome || "",
    ROTULOS[d.tipo] || d.tipo || "",
    dataBR(d.data_documento || d.criado_em) || "",
    diaDoDocumento(d),
  ].join(" "));
}

/* Todos os termos precisam casar, em qualquer ordem: "eco 2026" acha o
   ecocardiograma de 2026 sem exigir que a pessoa lembre a ordem em que as
   palavras aparecem no documento. */
function casaBusca(d, termos) {
  if (!termos.length) return true;
  const texto = textoBuscavel(d);
  return termos.every((t) => texto.includes(t));
}

function termosDaBusca() {
  return semAcento(el.busca.value).split(/\s+/).filter(Boolean);
}

/* ── Corpo e folhinhas ─────────────────────────────────────────────────
   Achar sem ler e sem digitar: toca-se a parte do corpo. Existe porque a
   busca por texto, por melhor que esteja, cobra duas coisas do paciente —
   saber escrever o nome do exame e enxergar o teclado. O piloto pede
   explicitamente uma pessoa com dificuldade real com celular, e para ela
   isto e a diferenca entre usar e desistir.

   POR QUE UM DOCUMENTO PODE ESTAR EM VARIAS REGIOES. Foi o que matou a
   ideia anterior de `especialidade`: la o campo tinha de escolher UMA
   gaveta, e o colesterol era sangue OU coracao, nunca os dois — quem
   procurasse pelo lado errado nao achava. Aqui e filtro, e filtro aceita
   pertencer a varios lugares. O TSH responde a "sangue" e a "pescoco"; o
   colesterol, a "sangue" e a "peito". Ninguem fica sem.

   POR QUE SANGUE E OSSO SAO FOLHINHA E NAO PARTE DO BONECO. Exame de
   laboratorio e a MAIOR parte de qualquer acervo e nao mora em canto nenhum
   da anatomia. Force-lo no braco ("foi de onde tiraram") explicaria a
   COLETA, nao o exame. Densitometria e o mesmo caso: coluna, quadril ou
   punho, conforme o aparelho. Folhinha com a palavra escrita resolve sem
   metafora torta — e a palavra escrita e justamente o que um icone sozinho
   nao entrega.

   O COMBUSTIVEL E O NOME do documento. Se o paciente nao digitar nada, o
   app grava o rotulo generico ("Exame") e nenhuma regiao acende. Isso e
   informacao sobre o piloto, nao defeito — e e um motivo a mais para a fase
   2: IA que preenche o nome acende o boneco sem ninguem digitar.

   Para estender: acrescente a palavra na lista da regiao. Nada mais muda. */
const REGIOES = [
  // no boneco
  // So a CABECA. O pescoco saiu por pedido do medico, junto com a mudanca
  // que lhe tirou o conteudo: a tireoide passou para a folhinha de
  // hormonios, e o que sobrava no pescoco eram carotidas (vascular, foi
  // para o torax) e "cervical", palavra ambigua demais para ficar solta —
  // coluna cervical e osso, colo uterino e outra coisa. `coluna` ja cobre a
  // primeira em Ossos.
  //
  // O desenho mantem o pescoco como SILHUETA: corpo sem pescoco fica
  // estranho, e ele nao precisa ser tocavel para existir.
  { id: "cabeca", corpo: true, rotulo: "Cabeça",
    chaves: ["cranio", "encefalo", "cerebro", "eeg", "enxaqueca", "hipofise",
             "sela turcica", "seios da face", "olho", "oftalm", "retina",
             "oculos", "visao", "acuidade", "fundo de olho", "ouvido",
             "audiometria", "otorrino", "nasal", "sinusite"],
    sub: [
      { id: "olhos", rotulo: "Olhos",
        chaves: ["olho", "oftalm", "retina", "oculos", "visao", "acuidade",
                 "fundo de olho", "catarata", "glaucoma", "tonometr",
                 "campimetr", "refra", "ocular", "cristalino", "macula"] },
      { id: "ouvidos", rotulo: "Ouvidos",
        chaves: ["ouvido", "audiometr", "otoscop", "timpano", "auditiv",
                 "impedanciometr", "labirint", "otoneurolog"] },
      { id: "nariz", rotulo: "Nariz",
        chaves: ["nasal", "nariz", "sinusite", "seios da face", "rinoscop",
                 "nasofibro", "septo", "rinite", "sinusopatia"] },
      { id: "garganta", rotulo: "Boca e garganta",
        chaves: ["otorrino", "garganta", "faringe", "laringe", "amigdal",
                 "laringoscop", "degluticao", "boca", "bucal", "dentar",
                 "panoramica", "odontolog"] },
      { id: "miolo", rotulo: "Crânio e cérebro",
        chaves: ["cranio", "encefalo", "cerebro", "=eeg", "enxaqueca",
                 "hipofise", "sela turcica", "neurolog", "eletroencefalo",
                 "meninge", "=avc", "isquemi"] },
    ] },
  { id: "peito", corpo: true, rotulo: "Tórax",
    // "ecocardio", nao "eco": "eco" casa dentro de "ecografia", e mandaria
    // todo ultrassom — de abdome, de tireoide, obstetrico — para o peito.
    chaves: ["coracao", "cardiac", "cardio", "ecocardio", "ecg", "eletrocardio",
             "holter", "mapa", "ergometr", "troponina", "ck-mb", "bnp",
             // O perfil lipidico e exame de sangue E assunto do coracao: e o
             // caso que a regiao unica nao resolvia, e aqui ele entra nos dois.
             "colesterol", "hdl", "ldl", "triglicer", "lipidograma",
             // vascular: a carotida veio do pescoco, que deixou de ser regiao
             "carotida", "doppler de carotid",
             "pressao arterial", "pulmao", "pulmonar", "torax", "espirometr",
             "polissonograf", "respirat", "mama", "mamograf", "mamaria"],
    sub: [
      { id: "coracao", rotulo: "Coração",
        chaves: ["coracao", "cardiac", "cardio", "ecocardio", "=ecg",
                 "eletrocardio", "holter", "=mapa", "ergometr", "troponina",
                 "ck-mb", "=bnp", "pressao arterial", "carotida", "arritmia",
                 "valva", "valvul", "aorta"] },
      { id: "colesterol", rotulo: "Colesterol",
        chaves: ["colesterol", "hdl", "ldl", "triglicer", "lipidograma",
                 "lipidico"] },
      { id: "pulmoes", rotulo: "Pulmões",
        chaves: ["pulmao", "pulmonar", "torax", "espirometr", "respirat",
                 "polissonograf", "apneia", "bronqu", "asma", "pleura"] },
      { id: "mamas", rotulo: "Mamas",
        chaves: ["mama", "mamograf", "mamaria", "bi-rads", "birads"] },
    ] },
  // Barriga e pelve eram DUAS regioes e viraram uma. Medido no aparelho, a
  // de baixo tinha 33x21px de alvo — e 44x44 e o minimo para o polegar
  // acertar sem tentar duas vezes. Alem disso a fronteira entre as duas
  // numa silhueta e arbitraria: exige adivinhar onde uma acaba, que e um
  // tipo de leitura — justamente o que o boneco existe para evitar.
  //
  // O ROTULO e so "Barriga", e a precisao mora noutro lugar. Chegou a ser
  // "Barriga e baixo-ventre", pela razao certa: anatomicamente abdome e
  // pelve sao cavidades distintas, e quem procura o exame de prostata nao
  // deveria adivinhar se "barriga" cobre. Mas essa duvida nao chega a
  // existir — quem digita "prostata" acha pelo nome do documento, e quem
  // toca embaixo no boneco acha porque a regiao desenhada vai ate o
  // quadril. O rotulo nao e especificacao, e nome; a especificacao esta no
  // DESENHO e no aria-label, que lista os orgaos dos dois lados.
  //
  // "Abdome" seria pior nas duas pontas: registro clinico num aplicativo de
  // paciente, e anatomicamente EXCLUI a pelve.
  //
  // "Cabeca e pescoco" segue composto, e nao e incoerencia: o pescoco SE VE
  // como parte separada no desenho, entao o nome precisa dizer que ela
  // responde junto. O baixo-ventre nao — e a mesma faixa continua.
  { id: "barriga", corpo: true, rotulo: "Abdome",
    chaves: ["abdome", "abdominal", "figado", "hepat", "tgo", "tgp",
             "transaminase", "gama gt", "glutamil", "bilirrubina", "amilase",
             "lipase", "pancrea", "vesicula", "biliar", "estomago", "gastr",
             "endoscopia", "colonoscopia", "intestin", "colon", "reto",
             "helicobacter",
             // Nada de urina nem de fezes AQUI. Elas tem folhinha propria, e
             // manter as palavras nos dois lugares faria o EAS aparecer ao
             // tocar o abdome e contar duas vezes — duas portas para a mesma
             // sala, que e o que ja tiramos tres vezes neste modulo.
             // A regra que sobra e limpa: no corpo, o ORGAO; nas folhinhas,
             // o MATERIAL colhido.
             // Rim e retroperitoneal: fica no abdome. Creatinina e ureia sao
             // de sangue e falam da funcao renal — ficam aqui tambem.
             "rim", "rins", "renal", "creatinina", "ureia"],
    sub: [
      { id: "figado", rotulo: "Fígado e vesícula",
        chaves: ["figado", "hepat", "tgo", "tgp", "transaminase", "gama gt",
                 "glutamil", "bilirrubina", "vesicula", "biliar", "esteatose",
                 "cirrose"] },
      { id: "digestivo", rotulo: "Estômago e intestino",
        chaves: ["estomago", "gastr", "endoscopia", "colonoscopia", "intestin",
                 "colon", "reto", "helicobacter", "esofag", "refluxo",
                 "retossigmoid", "polipo", "diverticul"] },
      { id: "rins", rotulo: "Rins",
        chaves: ["=rim", "=rins", "renal", "creatinina", "ureia", "nefro",
                 "calculo renal", "litiase"] },
      { id: "pancreas", rotulo: "Pâncreas",
        chaves: ["pancrea", "amilase", "lipase"] },
    ] },

  // A regiao que faltava, e que fecha uma pendencia: estas palavras estavam
  // no ABDOME, cuja area desenhada nao chegava ate elas. Quem procurava o
  // exame de prostata tocava a barriga e encontrava — por sorte da lista,
  // nao por desenho. Agora o nome, o desenho e as palavras dizem a mesma
  // coisa.
  { id: "pelve", corpo: true, rotulo: "Pelve",
    chaves: ["pelvic", "pelve", "bexiga", "vesical", "prostata", "psa",
             "utero", "uterin", "endometri", "ovario", "anexos uterinos",
             "transvaginal", "papanicolau", "preventivo", "colpocitolog",
             "ginecolog", "testiculo", "escrotal", "bolsa testicular",
             "vesicula seminal", "uretra", "colo do utero"],
    sub: [
      { id: "prostata", rotulo: "Próstata",
        chaves: ["prostata", "=psa", "antigeno prostatico", "prostatic",
                 "vesicula seminal", "uroflux"] },
      { id: "utero", rotulo: "Útero e ovários",
        chaves: ["utero", "uterin", "endometri", "ovario", "anexos uterinos",
                 "transvaginal", "papanicolau", "preventivo", "colpocitolog",
                 "ginecolog", "colo do utero", "histeross", "mioma"] },
      { id: "bexiga", rotulo: "Bexiga",
        chaves: ["bexiga", "vesical", "uretra", "urodinamic", "cistoscop"] },
      { id: "testiculos", rotulo: "Testículos",
        chaves: ["testiculo", "escrotal", "bolsa testicular", "varicocele",
                 "espermograma", "epididim"] },
    ] },

  // Bracos e pernas, SEPARADOS. A lacuna que fecharam: Doppler venoso e
  // arterial de membros inferiores nao caia em lugar NENHUM, nem
  // eletroneuromiografia — e varizes e trombose nao sao exames raros, menos
  // ainda numa clinica de cardiologia. Osso e articulacao ja tinham casa em
  // Ossos, mas quem fez ressonancia de joelho pensa "meu joelho" e aponta a
  // perna, nao deduz que joelho e osso.
  //
  // O que e AMBIGUO aparece nos DOIS: "doppler venoso" sem dizer onde,
  // "trombose", "eletroneuromiografia", "dedo", "falange". Um exame que
  // pode ser de braco ou de perna deve acender os dois — quem procura
  // encontra pelo lado que pensou, e o outro lado nao atrapalha.
  { id: "bracos", corpo: true, rotulo: "Braços",
    exceto: ["membros inferiores", "mmii"],
    chaves: ["ombro", "cotovelo", "punho", "carpo", "braco", "antebraco",
             "=mao", "=maos", "=radio", "=umero", "ulna", "escapula",
             "quirodactil", "sindrome do tunel", "membros superiores", "mmss",
             // ambiguos, tambem nas pernas
             "dedo", "falange", "doppler venoso", "doppler arterial",
             "trombose", "insuficiencia venosa", "eletroneuromiografia",
             "eletromiografia"] },
  { id: "pernas", corpo: true, rotulo: "Pernas",
    exceto: ["membros superiores", "mmss"],
    chaves: ["joelho", "tornozelo", "coxa", "perna", "panturrilha", "femur",
             "tibia", "fibula", "patela", "calcanhar", "=pe", "=pes",
             "metatarso", "pododactil", "plantar", "varizes",
             "membros inferiores", "mmii",
             // ambiguos, tambem nos bracos
             "dedo", "falange", "doppler venoso", "doppler arterial",
             "trombose", "insuficiencia venosa", "eletroneuromiografia",
             "eletromiografia"] },

  // folhinhas — o que nao tem lugar no corpo NEM no seletor de tipo
  //
  // Havia tambem "Receitas" e "Outros papeis", e sairam: as duas filtravam
  // por `tipo`, que e exatamente o que o seletor de tipo ja faz. Dois
  // controles para a mesma coisa nao sao enfase, sao a duvida de qual dos
  // dois e o certo — a mesma razao pela qual a faixa do convite da agenda
  // tambem saiu.
  //
  // Sangue e osso ficam porque nenhum seletor os alcanca: sao exames
  // (tipo "exame") como qualquer outro, e o que os distingue e o assunto.
  { id: "sangue", corpo: false, rotulo: "Sangue", icone: "🩸",
    chaves: ["hemograma", "sangue", "hematocrito", "hemoglobina", "plaqueta",
             "leucocit", "glicose", "glicemia", "glicada", "hba1c",
             "colesterol", "hdl", "ldl", "triglicer", "lipidograma",
             "creatinina", "ureia", "acido urico", "tsh", "t3", "t4",
             "vitamina", "ferritina", "ferro", "albumina", "proteina",
             // O laudo diz de onde saiu: "serico", "no soro", "plasmatico".
             // Sem estas, o cortisol e a maioria dos hormonios nao caiam em
             // sangue — e sao todos exames de sangue.
             "serico", "serica", "no soro", "plasma", "plasmatic",
             "=psa", "antigeno prostatico",   // PSA e dosagem no sangue
             "sorologia", "anticorpo", "pcr", "vhs", "coagulograma", "tap",
             "protrombina", "fosfatase", "gama gt", "tgo", "tgp",
             "bilirrubina", "eletroforese", "tipagem", "dosagem"] },
  // Urina e fezes sao MATERIAL COLHIDO, como sangue — e e assim que a pessoa
  // procura: "exame de urina", nunca "exame da bexiga". Continuam acendendo
  // tambem a regiao do corpo, porque um documento cabe em varias: quem pensa
  // no material acha, quem pensa no lugar tambem.
  //
  // Nada de "eas" solto na lista: ele casa dentro de PANCREAS. Palavra curta
  // em busca por pedaco e armadilha — a mesma que fez "eco" mandar toda
  // ecografia para o peito.
  // Gota AMARELA, desenhada, e nao a 💧 do teclado: aquela e azul em todo
  // sistema, e azul ao lado da gota vermelha do sangue le-se como agua. E o
  // par sangue/urina que a pessoa reconhece de relance na trilha, entao a
  // cor aqui carrega significado, nao enfeite. Como o icone entra por
  // innerHTML, um SVG curto serve tao bem quanto um emoji.
  { id: "urina", corpo: false, rotulo: "Urina",
    icone: '<svg viewBox="0 0 16 16" width="1.05em" height="1.05em" '
         + 'style="vertical-align:-2px" aria-hidden="true">'
         + '<path d="M8 1.2C8 1.2 2.8 7.2 2.8 10.1a5.2 5.2 0 0 0 10.4 0'
         + 'C13.2 7.2 8 1.2 8 1.2Z" fill="#e3a91b"/>'
         + '<path d="M6.2 9.6a2.6 2.6 0 0 0 1.6 2.4" stroke="#fff" '
         + 'stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".75"/>'
         + '</svg>',
    chaves: ["urina", "urinar", "urinari", "urocultura", "elementos anormais",
             "=eas",   // volta com seguranca: nao casa mais em "pancreas"
             "sedimentoscopia", "proteinuria", "microalbumin", "urina de 24",
             "clearance"] },
  // Potinho coletor, desenhado. Era a 🧫 do teclado, e emoji nao e nosso:
  // cada sistema desenha o seu, e a mesma placa de Petri sai rosa no Android
  // e AZULADA no Windows — que e onde a pagina do medico e aberta. Icone que
  // muda de cor conforme o aparelho nao pode carregar significado.
  //
  // O potinho e o que o paciente reconhece: e o objeto que ele leva ao
  // laboratorio. Marrom porque e a unica cor que ninguem confunde com a
  // gota do sangue nem com a da urina — as tres ficam lado a lado.
  { id: "fezes", corpo: false, rotulo: "Fezes",
    icone: '<svg viewBox="0 0 16 16" width="1.05em" height="1.05em" '
         + 'style="vertical-align:-2px" aria-hidden="true">'
         + '<rect x="3.6" y="2.2" width="8.8" height="2.8" rx="1" fill="#6f4a2b"/>'
         + '<path d="M4.4 5.2h7.2v7.4a1.6 1.6 0 0 1-1.6 1.6H6a1.6 1.6 0 0 1-1.6-1.6Z" '
         + 'fill="#a97142"/>'
         + '<rect x="4.4" y="7.4" width="7.2" height="1.5" fill="#c08a58"/>'
         + '</svg>',
    chaves: ["fezes", "parasitolog", "coprocultura", "coproscopia",
             "sangue oculto", "oxiuro", "calprotectina", "rotavirus"] },
  // Hormonios: nao tem lugar no corpo (a tireoide tem, mas o cortisol, o
  // estradiol e a insulina nao) e nenhum seletor os alcanca — sao tipo
  // "exame" como qualquer outro. Passam pela regra.
  //
  // NADA de "trab" na lista, embora seja o nome do anticorpo anti-receptor
  // de TSH: "trab" casa dentro de ATESTADO DE TRABALHO. "tsh" ja pega esse
  // exame pelo nome completo. Terceira palavra curta a morder neste modulo,
  // depois de "eco" dentro de "ecografia" e "eas" dentro de "pancreas".
  { id: "hormonios", corpo: false, rotulo: "Hormônios",
    icone: '<svg viewBox="0 0 16 16" width="1.05em" height="1.05em" '
         + 'style="vertical-align:-2px" aria-hidden="true">'
         + '<circle cx="7" cy="8.6" r="4.4" fill="#7a52a1"/>'
         + '<circle cx="12.6" cy="4.2" r="1.7" fill="#b08fd0"/>'
         + '<circle cx="13.2" cy="9.6" r="1.2" fill="#b08fd0"/>'
         + '<circle cx="9.8" cy="2.6" r="1" fill="#cbb3e4"/>'
         + '</svg>',
    chaves: ["tireoide", "tireoid", "tsh", "t3", "t4", "tiroglobulina",
             "=trab",  // volta: nao casa mais em "atestado de trabalho"
             "paratireoide", "pth", "cortisol", "prolactina", "fsh",
             "estradiol", "testosterona", "progesterona", "insulina",
             "hormon", "acth", "aldosterona", "dhea", "hcg", "igf",
             "somatomedina", "peptideo c"] },
  // Pele: o caso mais limpo depois do sangue. Esta em TODA PARTE, entao nao
  // tem lugar no corpo — e nenhum seletor a alcanca, porque biopsia de pele
  // e tipo "exame" como qualquer outro.
  { id: "pele", corpo: false, rotulo: "Pele",
    icone: '<svg viewBox="0 0 16 16" width="1.05em" height="1.05em" '
         + 'style="vertical-align:-2px" aria-hidden="true">'
         + '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.4" fill="#e0b088"/>'
         + '<circle cx="10.4" cy="6" r="2" fill="#8a5a3b"/>'
         + '<circle cx="5.4" cy="10.4" r="1.1" fill="#c08f66"/>'
         + '</svg>',
    chaves: ["=pele", "dermat", "dermatoscop", "nevo", "melanoma",
             "mapeamento corporal", "micolog", "cutane", "epiderm",
             "onicomicose", "=unha", "=unhas", "teste de contato",
             "alergia de contato", "lesao de pele", "ceratose"] },
  { id: "ossos", corpo: false, rotulo: "Ossos", icone: "🦴",
    chaves: ["osso", "ossea", "densitometr", "coluna", "lombar", "vertebr",
             "joelho", "ombro", "quadril", "punho", "tornozelo", "fratura",
             "artro", "reumat", "calcio", "fator reumatoide", "ortoped"] },
];

/* Em quais regioes este documento entra. Conjunto, nao valor unico — ver o
   comentario acima. Documento que nao casa com nada nao entra em nenhuma,
   e continua alcancavel pela lista e pela busca: o boneco ACRESCENTA um
   caminho, nunca e o unico. */
/* Casa uma palavra-chave contra o texto do documento.

   DUAS FORMAS, e a segunda existe porque a primeira mordeu seis vezes:

     "hepat"   PEDACO — casa em "hepatico", "hepatite". E o que se quer na
               maioria: o laudo varia a terminacao.
     "=pe"     PALAVRA INTEIRA — casa em "RX DE PE", nao em peito, pescoco,
               pele nem pesquisa.

   Sem a segunda forma, palavra curta e armadilha: "eco" dentro de
   "ecografia" mandou todo ultrassom para o torax; "eas" dentro de
   "pancreas" quase mandou pancreas para urina; "trab" dentro de "trabalho";
   "umero" dentro de "numero"; "radio" dentro de "radiografia". Cada uma foi
   contornada tirando a palavra da lista — o que fechava o buraco e deixava
   o exame sem casa. Maos e pes eram o caso que nao dava para contornar: nao
   existe sinonimo longo para "pe".

   Feito com indexOf e regex LITERAL: `new RegExp("\b" + ...)` exigiria
   barra invertida dentro de string, e ela nao sobrevive a geracao deste
   arquivo. */
function casaChave(texto, chave) {
  if (chave[0] !== "=") return texto.includes(chave);
  const p = chave.slice(1);
  const letra = /[a-z0-9]/;
  for (let i = texto.indexOf(p); i >= 0; i = texto.indexOf(p, i + 1)) {
    const antes = i === 0 ? " " : texto[i - 1];
    const depois = texto[i + p.length] || " ";
    if (!letra.test(antes) && !letra.test(depois)) return true;
  }
  return false;
}

function regioesDoDocumento(d) {
  const texto = semAcento((d.nome || "") + " " + (ROTULOS[d.tipo] || ""));
  const achadas = new Set();
  for (const r of REGIOES) {
    if (r.tipos && r.tipos.includes(d.tipo)) { achadas.add(r.id); continue; }
    // `exceto` desempata o ambiguo. "doppler venoso" sozinho pode ser de
    // braco ou de perna, entao esta nas duas listas — mas quando o laudo
    // DIZ "membros inferiores", acender os bracos junto e ruido. A palavra
    // especifica vence a ambigua.
    if (r.exceto && r.exceto.some((c) => casaChave(texto, c))) continue;
    if (r.chaves.some((c) => casaChave(texto, c))) achadas.add(r.id);
  }
  return achadas;
}

/* ═══ Agrupar por exame ═══════════════════════════════════════════════════
   Uma linha por exame, nao por data. As DUAS telas usam isto: o medico
   quer "como esta a hemoglobina ao longo do tempo"; o paciente, cujo
   acervo cresce para sempre e nunca e limpo, acaba com quinze hemogramas
   numa lista onde a unica diferenca e a data.

   A CHAVE E O NOME EXATO — sem acento, sem caixa, sem espaco a mais — e
   nao "um nome contido no outro", que era o plano ate o contra-exemplo:

     "ULTRASSOM"            engoliria
     "ULTRASSOM DE PELE"    e
     "ULTRASSOM DE ABDOME"

   Exame de pele escondido dentro do grupo do abdome e pior que dois grupos
   parecidos lado a lado: ninguem ve o que nao sabe que existe. "RAIO-X" e
   "TOMOGRAFIA" tem o mesmo problema — sao familias, nao exames.

   O custo: quem escreveu "HEMOGRAMA" numa vez e "HEMOGRAMA COMPLETO"
   noutra fica com dois grupos. A ordem ALFABETICA resolve na pratica,
   deixando os dois vizinhos. Adjacencia em vez de fusao.
   ═══════════════════════════════════════════════════════════════════════ */
function chaveDoExame(d) {
  return semAcento(d.nome || ROTULOS[d.tipo] || "").replace(/\s+/g, " ").trim();
}

function agruparPorExame(lista) {
  const mapa = new Map();
  for (const d of lista) {
    const k = chaveDoExame(d);
    if (!mapa.has(k)) mapa.set(k, { chave: k, nome: d.nome || ROTULOS[d.tipo], docs: [] });
    mapa.get(k).docs.push(d);
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    // Dentro do grupo, o mais recente em cima: e o que se abre primeiro, e
    // e o que responde "como esta agora".
    g.docs.sort((a, b) => String(b.data_documento || b.criado_em)
      .localeCompare(String(a.data_documento || a.criado_em)));
  }
  return grupos.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
}

function anoDe(d) {
  return String(d.data_documento || d.criado_em || "").slice(0, 4);
}

/* O texto do grupo: "4 exames · 2022 – 2026", ou so o ano quando todos
   caem no mesmo. Aqui porque as duas telas escrevem a mesma frase. */
function resumoDoGrupo(g) {
  const primeiro = anoDe(g.docs[g.docs.length - 1]);
  const ultimo = anoDe(g.docs[0]);
  const periodo = primeiro && ultimo && primeiro !== ultimo
    ? primeiro + " – " + ultimo : (ultimo || "");
  return g.docs.length + " exames" + (periodo ? " · " + periodo : "");
}

/* ═══ Sub-assuntos ════════════════════════════════════════════════════════
   O refino DENTRO de uma regiao. Nasceu de uma pergunta melhor do que a
   resposta que eu quase dei: "e se clicar na cabeca abrisse a cabeca, com
   olhos, boca, nariz e orelhas?".

   Um segundo desenho custava caro e rendia pouco. Ao tamanho em que o
   boneco vive, a cabeca tem 35px — um olho ali daria 8px, muito abaixo dos
   44 que o polegar acerta. Para ter alvo utilizavel a cabeca teria de
   ocupar a TELA, e ai nao e mais "aponte onde doi": e entrar, escolher e
   aprender a voltar. E se a cabeca abre, por que o abdome nao abre? Seriam
   seis desenhos, e o mesmo documento com tres enderecos.

   As fichinhas entregam o refino sem tela nova, e valem para as QUATRO
   regioes onde a lista cresce de verdade — nao so a cabeca.

   TRES REGRAS, e cada uma existe por um jeito de errar:

   1. So aparecem com DOIS ou mais sub-assuntos presentes. Cabeca com uma
      audiometria so nao mostra nada: nao ha o que escolher, e oferecer
      escolha de um item ensina que o controle nao serve.

   2. Documento que casa a REGIAO mas nenhum sub-assunto entra em TODOS.
      "ULTRASSOM DE ABDOME TOTAL" nao e do figado nem do rim — e dos dois,
      e do pancreas tambem, porque o laudo fala de todos. Deixa-lo de fora
      faria o exame sumir ao tocar em "Figado", que e onde a pessoa o
      procura.

   3. O generico nao ACENDE fichinha (conta em `soltos`, nao em `proprios`).
      Senao um acervo com um unico ultrassom de abdome produziria quatro
      fichinhas de "1" que devolvem sempre o mesmo documento — quatro portas
      para a mesma sala, que e o erro que este modulo ja desfez tres vezes.
   ═══════════════════════════════════════════════════════════════════════ */

/* Quantos documentos por sub-assunto da regiao. Devolve [] quando a regiao
   nao tem sub-assunto, quando o refino nao separaria nada, ou quando menos
   de dois sub-assuntos tem documento PROPRIO. */
function subAssuntos(idRegiao, docs) {
  const r = REGIOES.find((x) => x.id === idRegiao);
  if (!r || !r.sub) return [];

  const proprios = {}, soltos = [];
  for (const d of docs) {
    if (!regioesDoDocumento(d).has(idRegiao)) continue;
    const texto = semAcento((d.nome || "") + " " + (ROTULOS[d.tipo] || ""));
    let caiu = false;
    for (const sub of r.sub) {
      if (sub.chaves.some((c) => casaChave(texto, c))) {
        (proprios[sub.id] = proprios[sub.id] || []).push(d);
        caiu = true;
      }
    }
    if (!caiu) soltos.push(d);          // regra 2: entra em todos
  }

  const vivos = r.sub.filter((sub) => (proprios[sub.id] || []).length);
  if (vivos.length < 2) return [];      // regra 1
  return vivos.map((sub) => ({
    id: sub.id, rotulo: sub.rotulo,
    n: (proprios[sub.id] || []).length + soltos.length,
  }));
}

/* O documento entra neste sub-assunto? Generico da regiao entra em todos. */
function noSubAssunto(d, idRegiao, idSub) {
  const r = REGIOES.find((x) => x.id === idRegiao);
  if (!r || !r.sub) return true;
  const texto = semAcento((d.nome || "") + " " + (ROTULOS[d.tipo] || ""));
  let caiu = false, dentro = false;
  for (const sub of r.sub) {
    if (sub.chaves.some((c) => casaChave(texto, c))) {
      caiu = true;
      if (sub.id === idSub) dentro = true;
    }
  }
  return caiu ? dentro : true;
}


/* ── CAPTCHA ──────────────────────────────────────────────────────────────
   Existe por um motivo só: a chave anônima é pública, e sem barreira
   qualquer um cria contas e enche o armazenamento. Não protege dado nenhum
   — disso cuida o RLS.

   Fica DESLIGADO enquanto `TURNSTILE_SITE_KEY` estiver vazio, e por isso
   ligar é uma decisão em dois lugares: a chave aqui e a proteção no painel
   do Supabase. Um sem o outro derruba o login — com a chave aqui e sem o
   painel, o token é ignorado; com o painel e sem a chave, toda sessão nova
   é recusada.                                                               */
async function tokenCaptcha() {
  const chave = (CONFIG.TURNSTILE_SITE_KEY || "").trim();
  if (!chave) return null;
  try {
    await new Promise((ok, falha) => {
      if (window.turnstile) return ok();
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = ok; s.onerror = falha;
      document.head.appendChild(s);
    });
    const caixa = document.createElement("div");
    caixa.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70";
    document.body.appendChild(caixa);
    const token = await new Promise((ok) => {
      window.turnstile.render(caixa, { sitekey: chave, callback: ok,
                                       "error-callback": (cod) => {
                                         // Guardado para a tela de erro: sem o
                                         // código, "domínio fora da lista" e
                                         // "navegador reprovado" são iguais.
                                         window.ultimoErroCaptcha = String(cod || "?");
                                         ok(null);
                                       } });
    });
    caixa.remove();
    return token;
  } catch (e) {
    // Falhando o carregamento, deixa passar: barrar o paciente por causa de
    // um script de terceiro que não abriu seria trocar abuso por exclusão.
    // Quem recusa de verdade é o Supabase, do outro lado.
    console.warn("[captcha]", e.message || e);
    window.ultimoErroCaptcha = "script";
    return null;
  }
}
