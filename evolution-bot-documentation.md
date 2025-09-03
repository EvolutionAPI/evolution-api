# Evolution Bot

O Evolution Bot é uma integração de chatbot universal que permite a utilização de qualquer URL de API ou automação para criar interações automatizadas. Ao utilizar o Evolution Bot, sua API deve retornar a resposta na forma de um JSON contendo o campo `message`, que será enviado de volta ao usuário. Este sistema oferece flexibilidade para construir chatbots que se integram perfeitamente com suas APIs personalizadas.

## 1. Criação de Bots no Evolution Bot

Você pode configurar bots no Evolution Bot utilizando triggers para iniciar as interações. A configuração do bot pode ser feita através do endpoint `/evolutionBot/create/{{instance}}`.

### Endpoint para Criação de Bots

#### Endpoint

```
POST {{baseUrl}}/evolutionBot/create/{{instance}}
```

#### Corpo da Requisição

Aqui está um exemplo de corpo JSON para configurar um bot no Evolution Bot:

```json
{
    "enabled": true,
    "apiUrl": "http://api.site.com/v1",
    "apiKey": "app-123456", // optional
    // opções
    "triggerType": "keyword", /* all ou keyword */
    "triggerOperator": "equals", /* contains, equals, startsWith, endsWith, regex, none */
    "triggerValue": "teste",
    "expire": 0,
    "keywordFinish": "#SAIR",
    "delayMessage": 1000,
    "unknownMessage": "Mensagem não reconhecida",
    "listeningFromMe": false,
    "stopBotFromMe": false,
    "keepOpen": false,
    "debounceTime": 0,
    "ignoreJids": []
}
```

### Explicação dos Parâmetros

- `enabled`: Ativa (`true`) ou desativa (`false`) o bot.
- `apiUrl`: URL da API que será chamada pelo bot (sem a `/` no final).
- `apiKey`: Chave da API fornecida pela sua aplicação (opcional).

**Opções:**
- `triggerType`: Tipo de trigger para iniciar o bot (`all` ou `keyword`).
- `triggerOperator`: Operador utilizado para avaliar o trigger (`contains`, `equals`, `startsWith`, `endsWith`, `regex`, `none`).
- `triggerValue`: Valor utilizado no trigger (por exemplo, uma palavra-chave ou regex).
- `expire`: Tempo em minutos após o qual o bot expira, reiniciando se a sessão expirou.
- `keywordFinish`: Palavra-chave que encerra a sessão do bot.
- `delayMessage`: Delay (em milissegundos) para simular a digitação antes de enviar uma mensagem.
- `unknownMessage`: Mensagem enviada quando a entrada do usuário não é reconhecida.
- `listeningFromMe`: Define se o bot deve escutar as mensagens enviadas pelo próprio usuário (`true` ou `false`).
- `stopBotFromMe`: Define se o bot deve parar quando o próprio usuário envia uma mensagem (`true` ou `false`).
- `keepOpen`: Mantém a sessão aberta, evitando que o bot seja reiniciado para o mesmo contato.
- `debounceTime`: Tempo (em segundos) para juntar várias mensagens em uma só.
- `ignoreJids`: Lista de JIDs de contatos que não ativarão o bot.

### Exemplo de Retorno da API

A resposta da sua API deve estar no formato JSON e conter a mensagem a ser enviada ao usuário no campo `message`:

```json
{
    "message": "Sua resposta aqui",
    "linkPreview": false
}
```

#### Opções Avançadas de Resposta

Sua API pode retornar campos adicionais para controlar como a mensagem é enviada:

- **`message`** (string, obrigatório): O texto da mensagem a ser enviada
- **`linkPreview`** (boolean, opcional): 
  - `true`: Habilita preview de links na mensagem (padrão)
  - `false`: Desabilita preview de links ⚠️ **Recomendado quando a mensagem contém emails ou URLs**

#### Exemplo com linkPreview desabilitado:

```json
{
    "message": "Seu email de confirmação: user@example.com\n\nAcesse: https://site.com/confirmar",
    "linkPreview": false
}
```

**💡 Dica:** Use `linkPreview: false` quando:
- A mensagem contém emails
- Há múltiplas URLs
- O preview tornaria a mensagem confusa

## 2. Configurações Padrão do Evolution Bot

Você pode definir configurações padrão que serão aplicadas caso os parâmetros não sejam passados durante a criação do bot.

### Endpoint para Configurações Padrão

#### Endpoint

```
POST {{baseUrl}}/evolutionBot/settings/{{instance}}
```

#### Corpo da Requisição

Aqui está um exemplo de configuração padrão:

```json
{
    "expire": 20,
    "keywordFinish": "#SAIR",
    "delayMessage": 1000,
    "unknownMessage": "Mensagem não reconhecida",
    "listeningFromMe": false,
    "stopBotFromMe": false,
    "keepOpen": false,
    "debounceTime": 0,
    "ignoreJids": [],
    "evolutionBotIdFallback": "clyja4oys0a3uqpy7k3bd7swe"
}
```

### Explicação dos Parâmetros

- `expire`: Tempo em minutos após o qual o bot expira.
- `keywordFinish`: Palavra-chave que encerra a sessão do bot.
- `delayMessage`: Delay para simular a digitação antes de enviar uma mensagem.
- `unknownMessage`: Mensagem enviada quando a entrada do usuário não é reconhecida.
- `listeningFromMe`: Define se o bot deve escutar as mensagens enviadas pelo próprio usuário.
- `stopBotFromMe`: Define se o bot deve parar quando o próprio usuário envia uma mensagem.
- `keepOpen`: Mantém a sessão aberta, evitando que o bot seja reiniciado para o mesmo contato.
- `debounceTime`: Tempo para juntar várias mensagens em uma só.
- `ignoreJids`: Lista de JIDs de contatos que não ativarão o bot.
- `evolutionBotIdFallback`: ID do bot de fallback que será utilizado caso nenhum trigger seja ativado.

## 3. Gerenciamento de Sessões do Evolution Bot

Você pode gerenciar as sessões do bot, alterando o status entre aberta, pausada ou fechada para cada contato específico.

### Endpoint para Gerenciamento de Sessões

#### Endpoint

```
POST {{baseUrl}}/evolutionBot/changeStatus/{{instance}}
```

#### Corpo da Requisição

Aqui está um exemplo de como gerenciar o status da sessão:

```json
{
    "remoteJid": "5511912345678@s.whatsapp.net",
    "status": "closed"
}
```

### Explicação dos Parâmetros

- `remoteJid`: JID (identificador) do contato no WhatsApp.
- `status`: Status da sessão (`opened`, `paused`, `closed`).

## 4. Variáveis Automáticas e Especiais no Evolution Bot

Quando uma sessão do Evolution Bot é iniciada, algumas variáveis predefinidas são automaticamente enviadas:

```javascript
inputs: {
    remoteJid: "JID do contato",
    pushName: "Nome do contato",
    instanceName: "Nome da instância",
    serverUrl: "URL do servidor da API",
    apiKey: "Chave de API da Evolution"
};
```

### Explicação das Variáveis Automáticas

- `remoteJid`: JID do contato com quem o bot está interagindo.
- `pushName`: Nome do contato no WhatsApp.
- `instanceName`: Nome da instância que está executando o bot.
- `serverUrl`: URL do servidor onde a Evolution API está hospedada.
- `apiKey`: Chave de API usada para autenticar as requisições.

### Considerações Finais

O Evolution Bot oferece uma plataforma flexível para integração de chatbots com suas APIs personalizadas, permitindo automação avançada e interações personalizadas no WhatsApp. Com o suporte para triggers, gerenciamento de sessões e configuração de variáveis automáticas, você pode construir uma experiência de chatbot robusta e eficaz para seus usuários.

## Links Relacionados

- [Chatwoot](https://doc.evolution-api.com/v2/pt/integrations/chatwoot)
- [Typebot](https://doc.evolution-api.com/v2/pt/integrations/typebot)
- [Website](https://evolution-api.com/)
- [GitHub](https://github.com/EvolutionAPI/evolution-api)

---

*Documentação extraída de: https://doc.evolution-api.com/v2/pt/integrations/evolution-bot*
