/** Texto da política de privacidade mostrado na app (e espelhado em docs/privacy-policy.md). RASCUNHO: rever por um jurista antes de publicar. */
export const PRIVACY_VERSION = 1;
export const PRIVACY_DRAFT_NOTE = 'Rascunho: rever por um jurista e preencher a identificação do responsável antes de publicar.';
export const PRIVACY_SECTIONS: { title: string; items: string[] }[] = [
  {
    "title": "Quem somos",
    "items": [
      "Esta política descreve como a app Gym & Nutrition Tracker trata os teus dados pessoais.",
      "Responsável pelo tratamento: [PREENCHER — nome/entidade, morada e email de contacto]."
    ]
  },
  {
    "title": "Que dados tratamos",
    "items": [
      "Conta: email, nome e fotografia de perfil fornecidos pelo início de sessão com Google.",
      "Treino: planos, sessões, cargas, repetições, tempos, recordes.",
      "Nutrição: alimentos, diário alimentar, objetivos calóricos, receitas.",
      "Corpo: peso, medidas, sexo, idade e altura (usados em fórmulas de cálculo).",
      "Preferências: dashboard, notificações, unidades.",
      "Conversas com o Treinador IA: ficam apenas no teu dispositivo.",
      "Fotografias de rótulos e refeições: processadas e apagadas de imediato; não são guardadas por nós."
    ]
  },
  {
    "title": "Para que usamos e com que base legal",
    "items": [
      "Prestar o serviço que pediste (guardar e sincronizar os teus dados): execução do contrato.",
      "Treinador IA e foto de refeição: apenas com o teu consentimento explícito, que podes retirar a qualquer momento.",
      "Não usamos os teus dados para publicidade nem os vendemos."
    ]
  },
  {
    "title": "Quem recebe os dados (subcontratantes)",
    "items": [
      "Google (início de sessão com Google).",
      "MongoDB Atlas (armazenamento na cloud dos dados sincronizados).",
      "Serviço de IA configurado no servidor (por defeito Google Gemini), só quando usas o Treinador IA ou a foto de refeição. Enviamos apenas os dados do âmbito que escolhes, sem nome nem email. No escalão gratuito do Gemini, a Google pode usar o conteúdo para melhorar os seus produtos.",
      "Open Food Facts: recebe apenas o código de barras ou o termo que pesquisas."
    ]
  },
  {
    "title": "Quanto tempo guardamos",
    "items": [
      "Até eliminares a conta (Definições → Eliminar conta e dados), que apaga os dados no servidor e no dispositivo.",
      "Sessões de login: 30 dias, renováveis; contadores de utilização da IA: 3 dias.",
      "Fotografias temporárias: removidas de imediato e, por segurança, ao fim de 7 dias."
    ]
  },
  {
    "title": "Os teus direitos",
    "items": [
      "Acesso e portabilidade: Definições → Exportar dados (inclui um backup completo da cloud).",
      "Retificação: editas os dados na própria app.",
      "Apagamento: Definições → Eliminar conta e dados.",
      "Retirar o consentimento da IA: separador Treinador IA → Revogar consentimento. Apagar conversas: Apagar histórico.",
      "Reclamação: Comissão Nacional de Proteção de Dados (www.cnpd.pt)."
    ]
  },
  {
    "title": "Segurança",
    "items": [
      "Comunicações por HTTPS, tokens de sessão de curta duração, dados isolados por utilizador, chaves de serviços externos apenas no servidor.",
      "Nenhum sistema é totalmente infalível; em caso de violação de dados serás informado nos termos da lei."
    ]
  },
  {
    "title": "Menores e aconselhamento",
    "items": [
      "A app não se destina a menores de 13 anos.",
      "A app e o Treinador IA não substituem o aconselhamento de médicos, nutricionistas ou treinadores. Estimativas (calorias, gordura corporal, cargas) são aproximações."
    ]
  }
];
