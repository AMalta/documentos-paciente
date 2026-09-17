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

/* O que cada documento oferece a busca. O rotulo do tipo entra para que
   "receita" funcione sem descobrir o seletor, e a data no formato BRASILEIRO
   para que "02/2026" e "2026" achem — e a data que a pessoa lembra. */
function textoBuscavel(d) {
  return semAcento([
    d.nome || "",
    ROTULOS[d.tipo] || d.tipo || "",
    dataBR(d.data_documento || d.criado_em) || "",
    (d.data_documento || d.criado_em || "").slice(0, 10),
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
  // Cabeca e pescoco eram DUAS e viraram uma, por ideia do medico e por
  // medicao: o pescoco tinha 9x7 PIXELS de area tocavel no celular — nao era
  // um botao, era um enfeite. E nenhum tamanho de boneco razoavel conserta
  // isso, porque pescoco e estreito por ser pescoco.
  //
  // Juntar tambem deixa a regra do desenho inteira: o BONECO guarda o que
  // tem lugar no corpo, as FOLHINHAS o que nao tem. A tireoide tem lugar —
  // manda-la para um cartao resolveria o alvo quebrando a regra.
  // "Cabeca e pescoco" ainda por cima e agrupamento clinico de verdade.
  { id: "cabeca", corpo: true, rotulo: "Cabeça e pescoço",
    chaves: ["cranio", "encefalo", "cerebro", "eeg", "enxaqueca", "hipofise",
             "sela turcica", "seios da face", "olho", "oftalm", "retina",
             "oculos", "visao", "acuidade", "fundo de olho", "ouvido",
             "audiometria", "otorrino", "nasal", "sinusite",
             // vindas do antigo "pescoco"
             "tireoide", "tireoid", "tsh", "t3", "t4", "trab", "carotida",
             "cervical", "paratireoide", "tiroglobulina"] },

  { id: "peito", corpo: true, rotulo: "Peito",
    // "ecocardio", nao "eco": "eco" casa dentro de "ecografia", e mandaria
    // todo ultrassom — de abdome, de tireoide, obstetrico — para o peito.
    chaves: ["coracao", "cardiac", "cardio", "ecocardio", "ecg", "eletrocardio",
             "holter", "mapa", "ergometr", "troponina", "ck-mb", "bnp",
             // O perfil lipidico e exame de sangue E assunto do coracao: e o
             // caso que a regiao unica nao resolvia, e aqui ele entra nos dois.
             "colesterol", "hdl", "ldl", "triglicer", "lipidograma",
             "pressao arterial", "pulmao", "pulmonar", "torax", "espirometr",
             "polissonograf", "respirat", "mama", "mamograf", "mamaria"] },
  // Barriga e pelve eram DUAS regioes e viraram uma. Medido no aparelho, a
  // de baixo tinha 33x21px de alvo — e 44x44 e o minimo para o polegar
  // acertar sem tentar duas vezes. Alem disso a fronteira entre as duas
  // numa silhueta e arbitraria: exige adivinhar onde uma acaba, que e um
  // tipo de leitura — justamente o que o boneco existe para evitar.
  //
  // O ROTULO diz as duas, e isso importa: anatomicamente abdome e pelve sao
  // cavidades distintas — figado, estomago, intestino e rins de um lado;
  // bexiga, prostata, utero e ovarios do outro. Na fala comum "barriga"
  // cobre as duas, mas quem procura o exame de prostata nao pode ter de
  // adivinhar se cobre. "Baixo-ventre" e a palavra leiga que nomeia a
  // pelve sem ser "quadril", que o paciente ouve como o OSSO — e osso e
  // outra gaveta aqui.
  { id: "barriga", corpo: true, rotulo: "Barriga e baixo-ventre",
    chaves: ["abdome", "abdominal", "figado", "hepat", "tgo", "tgp",
             "transaminase", "gama gt", "glutamil", "bilirrubina", "amilase",
             "lipase", "pancrea", "vesicula", "biliar", "estomago", "gastr",
             "endoscopia", "colonoscopia", "intestin", "colon", "reto",
             "fezes", "parasit", "helicobacter",
             // pelvicas
             "rim", "rins", "renal", "urina", "urinar", "eas", "elementos anormais",
             "creatinina", "ureia", "clearance", "bexiga", "prostata", "psa",
             "utero", "uterin", "ovario", "transvaginal", "papanicolau",
             "preventivo", "ginecolog", "pelvic"] },

  // folhinhas — o que nao tem lugar no corpo
  { id: "sangue", corpo: false, rotulo: "Sangue", icone: "🩸",
    chaves: ["hemograma", "sangue", "hematocrito", "hemoglobina", "plaqueta",
             "leucocit", "glicose", "glicemia", "glicada", "hba1c",
             "colesterol", "hdl", "ldl", "triglicer", "lipidograma",
             "creatinina", "ureia", "acido urico", "tsh", "t3", "t4",
             "vitamina", "ferritina", "ferro", "albumina", "proteina",
             "sorologia", "anticorpo", "pcr", "vhs", "coagulograma", "tap",
             "protrombina", "fosfatase", "gama gt", "tgo", "tgp",
             "bilirrubina", "eletroforese", "tipagem", "dosagem"] },
  { id: "ossos", corpo: false, rotulo: "Ossos", icone: "🦴",
    chaves: ["osso", "ossea", "densitometr", "coluna", "lombar", "vertebr",
             "joelho", "ombro", "quadril", "punho", "tornozelo", "fratura",
             "artro", "reumat", "calcio", "fator reumatoide", "ortoped"] },
  { id: "receitas", corpo: false, rotulo: "Receitas", icone: "💊",
    tipos: ["receita"], chaves: ["receita", "receitu", "prescric", "medicament"] },
  { id: "papeis", corpo: false, rotulo: "Outros papéis", icone: "📄",
    tipos: ["relatorio", "outro"], chaves: ["atestado", "declarac", "encaminh",
             "relatorio", "guia", "autorizac", "vacina"] },
];

/* Em quais regioes este documento entra. Conjunto, nao valor unico — ver o
   comentario acima. Documento que nao casa com nada nao entra em nenhuma,
   e continua alcancavel pela lista e pela busca: o boneco ACRESCENTA um
   caminho, nunca e o unico. */
function regioesDoDocumento(d) {
  const texto = semAcento((d.nome || "") + " " + (ROTULOS[d.tipo] || ""));
  const achadas = new Set();
  for (const r of REGIOES) {
    if (r.tipos && r.tipos.includes(d.tipo)) { achadas.add(r.id); continue; }
    if (r.chaves.some((c) => texto.includes(c))) achadas.add(r.id);
  }
  return achadas;
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
                                       "error-callback": () => ok(null) });
    });
    caixa.remove();
    return token;
  } catch (e) {
    // Falhando o carregamento, deixa passar: barrar o paciente por causa de
    // um script de terceiro que não abriu seria trocar abuso por exclusão.
    // Quem recusa de verdade é o Supabase, do outro lado.
    console.warn("[captcha]", e.message || e);
    return null;
  }
}
