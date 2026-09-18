/* ═══════════════════════════════════════════════════════════════════════
   Termo de consentimento.

   Foto de exame traz nome, CPF e resultado — dado pessoal sensível, artigo
   11 da LGPD. Consentimento aqui precisa ser ATO AFIRMATIVO e informado:
   uma frase no rodapé dizendo "seus dados estão seguros" não é aceite, e
   um botão "Começar" sozinho também não.

   Mas parede de texto jurídico não é informar — é a forma mais eficiente de
   garantir que ninguém leia. Daí o desenho em duas camadas: seis frases que
   respondem o que a lei exige (o quê, onde, quem vê, por quanto tempo, e o
   que isto NÃO é), e o texto completo a um toque para quem quiser.

   A VERSÃO é guardada junto da data no banco. "O usuário aceitou" não
   demonstra nada seis meses depois, quando o texto já mudou — só o par
   data+versão sustenta o que foi aceito.
   ═══════════════════════════════════════════════════════════════════════ */
/* QUEM RESPONDE PELOS DADOS — PREENCHER ANTES DO PILOTO.
   Enquanto estiver em branco, `testes/conferir.js` REPROVA. Isto é de
   propósito: o item já estava na lista do piloto, em branco, e passou
   despercebido por dias. Lista de tarefas não segura nada; checagem que
   falha, sim.

   Não é burocracia. A LGPD dá ao paciente o direito de pedir cópia,
   correção e exclusão dos dados — e direito contra ninguém não é direito.
   Um termo que não diz A QUEM reclamar é um papel, não um consentimento.

   Quem preenche precisa decidir de verdade quem assume: a pessoa física do
   médico ou a empresa da clínica. Não dá para adivinhar daqui, e chutar num
   documento legal seria pior que deixar a checagem falhando. */
const RESPONSAVEL = {
  nome: "",        // pessoa ou empresa que responde pelos dados
  documento: "",   // CPF ou CNPJ
  contato: "",     // e-mail ou telefone para pedidos e dúvidas
};

window.TERMO = {
  /* SOBE SÓ QUANDO A SUBSTÂNCIA MUDA, nunca por correção de vírgula: o
     aplicativo compara este número com o que está gravado e pede o aceite
     de NOVO quando diferem. Pedir por causa de um ajuste de redação ensina
     a clicar em "aceito" sem ler, que é o contrário do que o consentimento
     serve.

     2026-09-19: a foto passou a ser enviada a um serviço de leitura
     automática fora do Brasil. Isso muda o que o paciente está permitindo,
     então o aceite anterior não vale para isto. */
  versao: "2026-09-19",

  // As seis frases da tela. Cada uma responde uma pergunta da LGPD sem
  // usar a palavra da LGPD.
  resumo: [
    ["📷", "Só entra o que você fotografar",
     "Nada é buscado em laboratório, convênio ou hospital. O acervo é o que "
     + "você escolher guardar."],
    ["🔒", "Ninguém vê sem você liberar",
     "Nem médico, nem clínica, nem laboratório. Para mostrar a um médico, "
     + "você gera um código na hora da consulta, e o acesso dele vence no "
     + "mesmo dia."],
    // A frase que faltava. Fica ENTRE o cadeado e o servidor no Brasil, de
    // propósito: é exatamente ali que a pessoa está formando a ideia de
    // "então nada sai daqui" — e uma coisa sai.
    ["🤖", "A foto é lida para adiantar seu trabalho",
     "Ao guardar um documento, a foto é enviada a um serviço de leitura "
     + "automática que sugere o nome e a data, para você não digitar. O "
     + "serviço não guarda a imagem, e você confere e corrige tudo antes "
     + "de salvar."],
    ["🇧🇷", "Fica guardado em servidor no Brasil",
     "Suas imagens ficam em servidor localizado no Brasil, com acesso "
     + "restrito à sua conta."],
    ["🗑️", "Você apaga quando quiser",
     "Qualquer documento, ou a conta inteira, sem pedir autorização a "
     + "ninguém. Apagou, sai do servidor."],
    ["⏳", "Fica enquanto você quiser",
     "Não há prazo de validade. Seus documentos ficam até você apagá-los ou "
     + "encerrar a conta."],
    ["📋", "Isto não é o seu prontuário",
     "É a sua cópia pessoal dos documentos. Não substitui o registro do seu "
     + "médico, e durante esta fase de testes guarde também os papéis "
     + "originais."],
  ],

  completo: `COMO SEUS DOCUMENTOS SÃO GUARDADOS

1. O QUE É GUARDADO
Apenas as fotografias que você tirar ou escolher no seu celular, e as
informações que você digitar sobre elas: tipo de documento, nome e data.
Nenhum dado é buscado automaticamente em laboratórios, convênios, hospitais
ou no seu aparelho.

2. PARA QUE SERVE
Para você ter seus exames, laudos, receitas e relatórios reunidos e
organizados, e poder mostrá-los ao médico sem carregar papel.

3. QUEM PODE VER
Somente você. Nenhum médico, clínica ou laboratório tem acesso ao seu acervo.

A única exceção está descrita no item 4 e acontece por sua conta: ao guardar
um documento, a foto é enviada a um serviço de leitura automática apenas para
sugerir o nome e a data. Fora isso, nada sai daqui sem você mandar.

Quando você quiser mostrar seus documentos a um médico, será você quem gera
um código dentro do aplicativo e o entrega a ele. Esse código vale por poucos
minutos e o acesso do médico termina no mesmo dia. Você pode ver, a qualquer
momento, quem abriu seu acervo e quando, e pode cancelar acessos.

4. A LEITURA AUTOMÁTICA DA FOTO
Quando você guarda um documento, a foto da primeira página é enviada a um
serviço de leitura automática (inteligência artificial) que fica fora do
Brasil. Ele devolve o que está escrito no papel — nome do exame, data e tipo
— e o aplicativo preenche esses campos para você não precisar digitar.

O que você precisa saber sobre isso:

- A imagem é usada SÓ para essa leitura. O serviço está configurado para não
  guardar a imagem nem o texto depois de responder.
- É uma sugestão, não um registro. Você lê, corrige o que estiver errado e só
  então guarda. A data, em especial, erra com frequência — o aplicativo marca
  o campo e pede que você confira no papel.
- Nada além dessa foto é enviado: nem seu e-mail, nem seu nome, nem os outros
  documentos do seu acervo.
- Sem internet, a leitura simplesmente não acontece e você digita como sempre.

Se você preferir que suas fotos não sejam enviadas para essa leitura, avise
quem lhe entregou este aplicativo: o recurso pode ser desligado.

5. ONDE FICA GUARDADO
Em servidor localizado no Brasil, com acesso restrito à sua conta. O sistema
é organizado de modo que uma conta não alcance os documentos de outra.

6. POR QUANTO TEMPO
Pelo tempo que você quiser. Não há prazo de validade e não há exclusão
automática. Seus documentos permanecem até que você os apague ou encerre a
conta.

7. COMO APAGAR
Dentro do aplicativo você pode apagar qualquer documento individualmente, ou
encerrar sua conta e apagar tudo de uma vez. O que é apagado sai do servidor.

8. SEU E-MAIL
Usado apenas para você conseguir voltar aos seus documentos em outro celular,
ou neste mesmo caso ele seja trocado ou limpo. Não é usado para propaganda e
não é repassado a médicos, clínicas ou laboratórios.

9. O QUE ESTE APLICATIVO NÃO É
Não é o seu prontuário médico e não substitui os registros do seu médico ou
da clínica, que seguem com as obrigações legais deles. Não é laudo, não é
diagnóstico e não interpreta resultados. É a sua cópia pessoal, organizada,
de documentos que já são seus.

10. FASE DE TESTES
Este aplicativo está em fase de testes com um grupo pequeno de pessoas.
Durante esse período, continue guardando os documentos originais em papel.

11. SEUS DIREITOS
Você pode, a qualquer momento, consultar, corrigir, apagar seus dados ou
retirar este consentimento, sem precisar justificar. Retirar o consentimento
significa encerrar a conta e apagar os documentos guardados.

12. QUEM RESPONDE POR ISTO
${RESPONSAVEL.nome}${RESPONSAVEL.documento ? " (" + RESPONSAVEL.documento + ")" : ""}
Para pedir cópia, correção ou exclusão dos seus dados, ou para tirar qualquer
dúvida sobre este documento, fale com: ${RESPONSAVEL.contato}`,
};
