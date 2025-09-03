# Evolution Bot - Exemplo Prático com LinkPreview

Este exemplo mostra como implementar uma API simples que utiliza o Evolution Bot com controle de link preview.

## 1. Exemplo de API em Node.js/Express

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook/evolutionbot', (req, res) => {
  const { query, inputs } = req.body;
  const userMessage = query.toLowerCase();
  
  // Exemplo 1: Mensagem com email (sem preview)
  if (userMessage.includes('email')) {
    return res.json({
      message: `Seu email de confirmação foi enviado para: ${inputs.pushName}@exemplo.com\n\nVerifique sua caixa de entrada.`,
      linkPreview: false  // ❌ Desabilita preview para evitar poluição visual
    });
  }
  
  // Exemplo 2: Mensagem com link promocional (com preview)  
  if (userMessage.includes('promoção')) {
    return res.json({
      message: `🎉 Promoção especial disponível!\n\nAcesse: https://loja.exemplo.com/promocao`,
      linkPreview: true   // ✅ Habilita preview para mostrar a página
    });
  }
  
  // Exemplo 3: Mensagem com múltiplos links (sem preview)
  if (userMessage.includes('links')) {
    return res.json({
      message: `📋 Links importantes:\n\n• Site: https://site.com\n• Suporte: https://help.site.com\n• Contato: contato@site.com`,
      linkPreview: false  // ❌ Múltiplos links ficariam confusos com preview
    });
  }
  
  // Exemplo 4: Resposta padrão
  return res.json({
    message: "Olá! Como posso ajudar você hoje?"
    // linkPreview não especificado = true (padrão)
  });
});

app.listen(3000, () => {
  console.log('API do Evolution Bot rodando na porta 3000');
});
```

## 2. Configuração do Evolution Bot

```json
{
    "enabled": true,
    "apiUrl": "http://sua-api.com/webhook/evolutionbot",
    "apiKey": "sua-chave-opcional",
    "triggerType": "all",
    "delayMessage": 1000,
    "unknownMessage": "Desculpe, não entendi. Digite 'ajuda' para ver as opções."
}
```

## 3. Exemplos de Uso

### ❌ Problema: Mensagem com preview desnecessário
```json
{
    "message": "Confirme seu pedido acessando: https://loja.com/pedido/123 ou entre em contato: vendas@loja.com"
    // Sem linkPreview = true (padrão) - Vai mostrar preview da URL e do email
}
```

**Resultado:** Mensagem poluída visualmente no WhatsApp.

### ✅ Solução: Desabilitar preview quando necessário
```json
{
    "message": "Confirme seu pedido acessando: https://loja.com/pedido/123 ou entre em contato: vendas@loja.com",
    "linkPreview": false
}
```

**Resultado:** Mensagem limpa e fácil de ler.

## 4. Casos de Uso Recomendados

### Use `linkPreview: false` quando:
- ✉️ Mensagem contém emails
- 🔗 Múltiplas URLs na mesma mensagem
- 📝 URLs são apenas referências/instruções
- 🏷️ Mensagens curtas onde o preview é maior que o texto

### Use `linkPreview: true` (ou omita) quando:
- 📰 Compartilhamento de artigos/notícias
- 🛒 Links promocionais/produtos
- 🌐 Preview ajuda a dar contexto
- 📱 Único link principal na mensagem

## 5. Exemplo de Implementação em PHP

```php
<?php
header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$query = strtolower($input['query'] ?? '');
$inputs = $input['inputs'] ?? [];

if (strpos($query, 'email') !== false) {
    echo json_encode([
        'message' => "Seu email de confirmação: " . $inputs['pushName'] . "@exemplo.com",
        'linkPreview' => false
    ]);
} elseif (strpos($query, 'site') !== false) {
    echo json_encode([
        'message' => "Visite nosso site: https://exemplo.com",
        'linkPreview' => true
    ]);
} else {
    echo json_encode([
        'message' => "Como posso ajudar?"
    ]);
}
?>
```

## 6. Teste da Implementação

Para testar sua implementação:

1. Configure o Evolution Bot com sua `apiUrl`
2. Envie mensagens de teste via WhatsApp
3. Verifique se os previews aparecem/desaparecem conforme esperado
4. Ajuste a lógica da sua API conforme necessário

## 7. Dicas Importantes

- 🔧 **Sempre teste** as mensagens no WhatsApp real para ver o resultado visual
- ⚡ **Performance**: `linkPreview: false` pode carregar mensagens mais rápido
- 📊 **Analytics**: Monitore quais tipos de mensagem têm melhor engajamento
- 🎯 **UX**: Priorize a legibilidade da mensagem sobre a funcionalidade de preview

---

*Este exemplo mostra como implementar o controle de link preview no Evolution Bot de forma prática e eficiente.*
