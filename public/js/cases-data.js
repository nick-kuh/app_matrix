/* =====================================================================
   CATÁLOGO DE ÁREAS E CASES — EDITE AQUI!
   Fonte única usada pelo telão (sorteio) e pelo admin (banco de cases).
   Cada case:
     nome        → título grande (obrigatório)
     autor       → apresentador (aparece no cabeçalho)
     duracao     → ex: "5 minutos"
     desafio     → texto do card DESAFIO
     stakeholder → nome dentro do card DESAFIO
     solucao     → texto do card SOLUÇÃO & TOOL
     tools       → lista (string ou array) de ferramentas
     impacto     → array de { label, value } (card IMPACTO)
     timeToValue → ex: "6 meses" (footer)
   O oráculo escolhe UM case por área.
   ===================================================================== */
window.SHARKTRIX_AREAS = [
  {
    nome: "CONSUMER",
    cases: [
      {
        nome: "AI Anvisa Monitor",
        autor: "Marianna Della Mea",
        duracao: "5 minutos",
        desafio: "O monitoramento de registros de cosméticos na ANVISA é manual, fragmentado e reativo, limitando a capacidade de identificar movimentos de inovação da concorrência com antecedência e consumindo tempo relevante do time regulatório de R&D.",
        stakeholder: "Assuntos Regulatórios / R&D (requested by Thais H)",
        solucao: "Automatizamos o monitoramento dos registros da ANVISA usando Databricks e estruturamos os dados com GenAI, transformando aprovações regulatórias em sinais precoces de inovação e movimentos da concorrência.",
        tools: ["Databricks", "GenAI"],
        impacto: [
          { label: "Antecipação estratégica", value: "+6 meses de vantagem para orientar portfólio, claims e priorização de inovação." },
          { label: "Eficiência operacional", value: "~120 horas/mês liberadas do time de Regulatory de P&D ao eliminar buscas manuais" }
        ],
        timeToValue: "2 Weeks"
      },
      {
        nome: "Nielsen IQ Share Agent",
        autor: "Alexandre Soares",
        duracao: "5 minutos",
        desafio: "A geração de insights de market share (Nielsen/NIQ) é manual, demorada e dependente de cálculos complexos, consumindo até 5 dias por mês por analista. Isso limita escala, atrasa decisões e mantém talentos seniores presos em tarefas operacionais (data wrangling em vez de recomendação estratégica).",
        stakeholder: "CMI (Juliana Bastos and Stephanie Decaillet)",
        solucao: "Implementamos um agente de IA (Copilot) que automatiza a análise de dados Nielsen ponta a ponta a partir de um simples comando (ex: “full analysis of Seda”):<br>• Processa 12 meses de histórico (Brasil + canais)<br>• Converte dados em uma narrativa clara (ganho/perda, onde e por quê)<br>• Decompõe drivers (promo vs. non-promo, preço, mix, distribuição, delist etc.)<br>• Aplica regras de negócio embarcadas, garantindo consistência metodológica",
        tools: [{ name: "Copilot", highlight: true }],
        impacto: [
          { label: "Produtividade", value: "~80–85% redução de tempo (de 1 semana → ~1 dia)" },
          { label: "Qualidade de decisão", value: "foco em “por quê” (não só “o quê”), com menor risco metodológico" },
          { label: "Escala e padronização", value: "framework reutilizável entre marcas e categorias" },
          { label: "Eficiência operacional", value: "16–20 horas/mês liberadas por analista" }
        ],
        timeToValue: "2 Weeks"
      },
      {
        nome: "dCom Pricing Monitor",
        autor: "Pedro Teixeira",
        duracao: "5 minutos",
        desafio: "Monitorar preços de concorrentes no ecommerce (pure players e farma) de forma contínua é intensivo em esforço manual, pouco ágil e limita a capacidade de reação rápida para manter competitividade, especialmente em períodos críticos como o plano de inverno de skincare.",
        stakeholder: "Marcos Alves",
        solucao: "Desenvolvimento de um agente automatizado (via Phyton/Databricks) para capturar preços da concorrência e estruturar o monitoramento ao longo de 3 meses, permitindo visibilidade contínua e acionamento rápido de ajustes de pricing",
        tools: ["Python", "Databricks"],
        impacto: [
          { label: "Competitividade", value: "resposta mais rápida a movimentos de preço da concorrência no ecommerce" },
          { label: "Eficiência operacional", value: "eliminação do esforço manual diário de coleta de preços (35 produtos em 5+ retailers)" },
          { label: "Impacto financeiro", value: "saving de ~33.5k em 3 meses" }
        ],
        timeToValue: "2 Weeks"
      }
    ]
  },
  {
    nome: "CUSTOMER DEVELOPMENT",
    cases: [
      {
        nome: "ROLLOUT GLOBAL NRM COPILOT AGENT",
        autor: "Italo Santos & Vinicius Santos",
        duracao: "5 minutos",
        desafio: "NRM analysis depending on descriptive dashboards (PBI based) or ad hoc analysis done in EXCEL, hence, insights generation can be time consuming.<br><br>The AGENT supports the NRM analyst to focus the analysis, create and validate hypothesis, and structure the story telling around opportunities identified",
        stakeholder: "Pedro Antunes (BW) | Jade N (PC)",
        solucao: "COPILOT Agent specialized in NRM analysis based on NIELSEN data.<br><br>Nielsen Data Sets | Prompt Engineering | Instruction Files",
        tools: [{ name: "Copilot", highlight: true }, "Power BI", "Excel"],
        impacto: [
          { value: "30% time reduction on insights Generation for NRM processes in BW (Treatment) and PC (Deodorants)*<br><i>(*) testing phase</i>" }
        ],
        timeToValue: "8 Weeks"
      },
      {
        nome: "DATA QUALITY CHECKER – EDDGIE STORE PANEL",
        autor: "Italo Santos & Vinicius Santos",
        duracao: "5 minutos",
        desafio: "STORE PANEL data set is consumed by multiple technology components in EDDGIE (PICOS, CRM, TRAX, etc).<br><br>Quality issues in STORE PANEL leads to incorrect KPI calculation, sales incentives evaluation and other operational issues.<br><br>Monthly checking the data quality is time consuming",
        stakeholder: "CD HUB Back Office",
        solucao: "COPILOT Agent specialized in checking the data quality of EDDGIE STORE PANEL.<br><br>Excel Data Sets | Validation Rules Inventory | Prompt Engineering",
        tools: [{ name: "Copilot", highlight: true }, "Excel"],
        impacto: [
          { value: "90% time reduction on data quality checks" }
        ],
        timeToValue: "8 Weeks"
      }
    ]
  },
  {
    nome: "FOCUS MARKET",
    cases: [
      {
        nome: "Time Bucket Hub Itupeva",
        autor: "Ana Cardoso",
        duracao: "5 minutos",
        desafio: "Atualmente não há mecanismos de verificação se os times de programação estão seguindo a capacidade acordada para o HUB. Logo, ao consolidar o DOC de cargas é comum que haja inconsistências onde há mais carros programados do que a capacidade planejada.<br><br><b>Oportunidade:</b> Evitar que os times de programação de carga extrapolem a capacidade acordada por dia/hora no HUB Itupeva.",
        stakeholder: "Operação HUB Itupeva – Diego Soaress",
        solucao: "<b>Solução:</b> Agente Agendador de Cargas – Agente que impede que os times de programação agendem cargas excedendo a capacidade do HUB.<br><b>Tool:</b> Copilot Studio (POC)",
        tools: [{ name: "Copilot Studio", highlight: true }],
        impacto: [
          { label: "Melhora nos indicadores", value: "Diminuição do TAT" },
          { value: "Zero estadia" },
          { value: "Diminuição de custos com motoristas" }
        ],
        timeToValue: "2 semanas"
      },
      {
        nome: "IA Community",
        autor: "Thaiz Cabral",
        duracao: "5 minutos",
        desafio: "Atualmente, embora ferramentas de Inteligência Artificial estejam disponíveis para grande parte dos colaboradores, a adoção ainda é desigual entre áreas e níveis de conhecimento.<br><br>Muitos colaboradores, especialmente em operações, logística e Supply Chain, ainda não conhecem aplicações práticas de IA para suas atividades do dia a dia, o que limita a captura de ganhos de produtividade e inovação.",
        stakeholder: "IA COMMUNITY - João Nascimento",
        solucao: "<b>Solução:</b> Aplicação de Treinamentos e atividades para engajar o time de C.O no uso das ferramentas de IA e criação de uma comunidade para discussão e trabalho em casos de negocios.<br><b>Tool:</b> Copilot Web e 365.",
        tools: ["Copilot Web", "Copilot 365"],
        impacto: [
          { value: "Tranformação digital em C.O;" },
          { value: "Aumento de Licenças;" },
          { value: "Aumento de Prompts gerados;" },
          { value: "Automação de Tarefas visando aumento de produtividade." }
        ],
        timeToValue: "Contínuo"
      },
      {
        nome: "Performance Insights Scorecard",
        autor: "Thaiz Cabral",
        duracao: "5 minutos",
        desafio: "Atualmente temos um scorecard de performace para C.O, com análises majoritariamente descritivas, gerando dificuldade em identificar correlações, tendências e alavancas de impacto, além do tempo elevado para geração de insights e baixa padronização na leitura dos dados entre áreas. O desafio é ultilizar IA para gerar um scorecard inteligente, automatico e que traga sugestões de atuação.",
        stakeholder: "Performance Insights Scorecard - Gabriela Coelho",
        solucao: "<b>Solução:</b> Uso do \"Analyst\" para explorar o \"score card\" de forma avançada, identificando padrões, correlações e tendências automaticamente. Construção de análises orientadas a dados para responder perguntas-chave (ex: o que mais impacta o resultado? onde atuar?). Geração de visualizações e explicações que aceleram a interpretação e suportam tomada de decisão.",
        tools: [{ name: "Analyst", highlight: true }],
        impacto: [
          { value: "Identificação de variáveis com os KPIs principais;" },
          { value: "Priorização baseada em drivers reais de performance;" },
          { value: "Redução do tempo para geração de insights (de horas/dias para minutos);" },
          { value: "Melhor qualidade na tomada de decisão." }
        ],
        timeToValue: "Imediato (insights já nas primeiras análises)"
      }
    ]
  },
  {
    nome: "DATAHUB",
    cases: [
      {
        nome: "AI at scale: transformando sell-out em ação semanal",
        autor: "Bruna Angelini",
        duracao: "5 minutos",
        desafio: "O report semanal de sell-out, compartilhado com toda a liderança de PC, exigia análise manual de um material extenso e fragmentado, tornando lenta a geração de insights claros e acionáveis para o negócio.",
        stakeholder: "Times de PC, Liderança (VPs, Diretores), Trade e Analytics",
        solucao: "Utilizamos o Copilot para transformar automaticamente o report em insights estruturados, resumos executivos e comparações semana a semana, garantindo consistência e velocidade na comunicação.",
        tools: [{ name: "Copilot", highlight: true }],
        impacto: [
          { value: "Reduzimos significativamente o tempo de análise, aceleramos o envio para a liderança e aumentamos a velocidade e qualidade da tomada de decisão, com maior foco nos principais drivers e mudanças relevantes." }
        ],
        timeToValue: "Implementação rápida, com ganhos percebidos já na primeira semana."
      },
      {
        nome: "IA na gestão de risco da campanha FIFA",
        autor: "Jéssica Caldato",
        duracao: "5 minutos",
        desafio: "Para a campanha FIFA 2026 de Rexona e Dove, precisávamos definir quais EANs participariam da ação promocional considerando diferentes níveis de estoque em cada cliente. A decisão precisava equilibrar dois riscos: baixa disponibilidade do produto promocional em clientes com necessidade de reposição ou excesso de estoque dos produtos regulares que pudesse comprometer a execução da campanha.",
        stakeholder: "CSP PC – Categoria Deos",
        solucao: "Redução do tempo de análise e maior agilidade na definição do portfólio promocional, minimizando riscos de ruptura e excesso de estoque.",
        tools: [{ name: "Copilot", highlight: true }],
        impacto: [
          { value: "O uso do Copilot reduziu significativamente o tempo dedicado aos cruzamentos e análises manuais, permitindo maior velocidade." }
        ],
        timeToValue: "Imediato, com aplicação direta no planejamento e execução da campanha FIFA 2026."
      },
      {
        nome: "IA como copiloto técnico: acelerando análises, desenvolvimento e tomada de decisão",
        autor: "Jéssica Caldato",
        duracao: "5 minutos",
        desafio: "A área de Analytics lida diariamente com desafios técnicos e analíticos, desde desenvolvimento de códigos em Databricks e Power BI até análises avançadas para suportar decisões de negócio. Muitas dessas atividades demandam tempo para pesquisa, desenvolvimento e validação.",
        stakeholder: "DataHub",
        solucao: "Utilizamos Copilot e Gemini para acelerar análises, apoiar o desenvolvimento de códigos e validar dados. As ferramentas ajudam o time a ganhar velocidade, aumentar a robustez dos processos e resolver desafios técnicos do dia a dia.",
        tools: [{ name: "Copilot", highlight: true }, "Gemini", "Databricks", "Power BI"],
        impacto: [
          { value: "Mais agilidade na execução das atividades, processos mais robustos e maior produtividade do time técnico, permitindo foco nas análises e recomendações de maior valor para o negócio." }
        ],
        timeToValue: "Imediato, com aplicação contínua nas atividades diárias do time."
      },
      {
        nome: "Projeções de Mercado",
        autor: "Beatriz Amaral",
        duracao: "5 minutos",
        desafio: "Acertar com o menor erro possível a projeção de vendas dos produtos Unilever para que a fábrica seja capaz de produzir o necessário ou realocar esforços.<br><br>Prever como o mercado está e o que impacta esse número para que o time estratégico possa atuar de forma rápida e minimizar impacto.",
        stakeholder: "Time de negócio – CSP Performance",
        solucao: "Projeção de vendas utilizando Séries Temporais que inclui variáveis exógenas. Esse algoritmo complexo foi feito em Linguagem R.",
        tools: ["R"],
        impacto: [
          { value: "Processo mais eficiente alinhado com o financeiro, além de decisões mais assertivas e rápidas, visando a economia de custos e otimização de margem." }
        ],
        timeToValue: "6 meses e constante evolução"
      }
    ]
  },
  {
    nome: "STRATEGY",
    cases: [
      {
        nome: "AURA (AI Unified Reporting Agent)",
        autor: "Nicolas Kuhnast",
        duracao: "5 minutos",
        desafio: "Hoje, a informação de portfólio está dispersa entre Teams, SharePoint, e-mails e documentos. Gerando perda de tempo, retrabalho, decisões lentas e forte dependência das lideranças para responder perguntas que deveriam ser resolvidas em segundos.<br><br>Nossos times investem tempo buscando dados, respondendo dúvidas repetitivas e construindo reportes manualmente, enquanto o negócio e nossos stakeholders exigem AGILIDADE, FOCO e EFICIÊNCIA na entrega de informação estratégica.",
        stakeholder: "Claudia Meira / CDIO BPC Latam",
        solucao: "AURA é o agente inteligente desenvolvido para se tornar o ponto único de interação entre as pessoas e as informações da organização. Inclusive traz relatórios automatizados com todas as informações do portfolio e por área.<br><br><b>Tools:</b> Microsoft Copilot Studio, Azure DevOps, Power BI, Teams, Power Automate",
        tools: [],
        impacto: [
          { label: "Produtividade", value: "+20 a 24h/mês" },
          { label: "Escalabilidade", value: "Tax Reform" },
          { label: "Especialização", value: "IA especializada em Portfolio Management, conectando governança, relatórios e tomada de decisão em uma única experiência." }
        ],
        timeToValue: "6 meses",
        extras: [
          { label: "Copilot Studio", img: "assets/aura-copilot.png" },
          { label: "Teams",          img: "assets/aura-teams.png" },
          { label: "CDIO Report",    img: "assets/aura-cdio-report.png" }
        ]
      }
    ]
  },
  {
    nome: "MAKE (BUSINESS OPS)",
    cases: [
      {
        nome: "Agente de IA para Diarização",
        autor: "Felipe Zompero",
        duracao: "5 minutos",
        desafio: "Processo manual e demorado (½ dia). Dependência de conhecimento individual. Comparações manuais em Excel. Sujeito a erros e inconsistências. Comunicação não padronizada com a CEVA.<br><br>Risco de falta de materiais para produção. Risco de parada de linha (shortage). Baixa visibilidade para decisões de movimentação logística.",
        stakeholder: "Logística Valinhos | Hugo Mariano | Catia Navarro",
        solucao: "IA analisa Planning + SAP WM. Identifica riscos e necessidades de movimentação. Recomenda ações para abastecimento da produção.",
        tools: [{ name: "M365 Copilot", highlight: true }, "SAP", "SharePoint"],
        impacto: [
          { label: "Tempo", value: "redução de ½ dia para < 1 hora ou menos" },
          { label: "Produção", value: "menor risco de shortage e parada de linha" },
          { label: "Qualidade", value: "análises mais precisas e consistentes" },
          { label: "Decisão", value: "mais rápida e orientada por dados" }
        ],
        timeToValue: "4 Semanas"
      }
    ]
  }
];
