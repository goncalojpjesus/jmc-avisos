// Servidor da clínica (endereço e chave pública: não são segredos; os dados estão protegidos por sessão + RLS).
// Cada aparelho só precisa de iniciar sessão uma vez: Definições → Ligação ao servidor.
window.JMC_CONFIG = window.JMC_CONFIG || {
  url: 'https://piudosbhockofrtiieig.supabase.co',
  key: 'sb_publishable_POCYHRzMTQDQPXf8ESnJ_w_I6QDMctw',
  // códigos pessoais: os mesmos do fecho de caixa, verificados através do Executive Lab
  lab: 'https://script.google.com/macros/s/AKfycbzUW36ofn8AVZ8rtA3K7eX3gBo5Th1MATJmUqMd3RWzCNSQrputj48YSdIeT69IBl7u/exec',
  // painel lateral do Dr. Gonçalo e da Dra. Catarina: endereços das outras apps do universo
  apps: {
    lab: 'https://goncalojpjesus.github.io/executive-lab/',
    caixa:'https://script.google.com/macros/s/AKfycbzhQD8Nej5px3qXbVHAP2aIGmggizq8uE5l0SColrxhXNml5du1-T-MQhIrgmCKd1c/exec',
    ponto:'https://goncalojpjesus.github.io/jmc-avisos/ponto/',
    documentos: 'https://script.google.com/macros/s/AKfycbyxCRjnQfkhpXnSbyR-03XprUi5NH61TBr0GfMxlhI3K9wvzpntALlaJjXmdLsz8jBcDg/exec?doc=menu',
    gestao:'https://script.google.com/macros/s/AKfycbzhQD8Nej5px3qXbVHAP2aIGmggizq8uE5l0SColrxhXNml5du1-T-MQhIrgmCKd1c/exec?gestao=1'
  },
  // notificações push (chave pública VAPID; a privada está só no servidor)
  vapid: 'BK-hHGZQ2CwJFDf91ZFDdTWomATirAYK5M2azjFAQnIH1KL5gzUSKq5b2_9oTmZuYpTJP3f6JoEY-_DQxXagNyo'
};
