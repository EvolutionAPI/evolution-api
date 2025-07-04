<h1 align="center">Evolution Api</h1>

<div align="center">

[![Docker Image	(https://img.shields.io/badge/Docker-Image-blue)](https://hub.docker.com/r/evoapicloud/evolution-api)]
[![Whatsapp Group](https://img.shields.io/badge/Group-WhatsApp-%2322BC18)](https://evolution-api.com/whatsapp)
[![Discord Community](https://img.shields.io/badge/Discord-Community-blue)](https://evolution-api.com/discord)
[![Postman Collection](https://img.shields.io/badge/Postman-Collection-orange)](https://evolution-api.com/postman) 
[![Documentation](https://img.shields.io/badge/Documentation-Official-green)](https://doc.evolution-api.com)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)
[![Support](https://img.shields.io/badge/Donation-picpay-green)](https://app.picpay.com/user/davidsongomes1998)
[![Sponsors](https://img.shields.io/badge/Github-sponsor-orange)](https://github.com/sponsors/EvolutionAPI)

</div>
  
<div align="center"><img src="./public/images/cover.png"></div>

## Evolution API

Evolution API began as a WhatsApp controller API based on [CodeChat](https://github.com/code-chat-br/whatsapp-api), which in turn implemented the [Baileys](https://github.com/WhiskeySockets/Baileys) library. While originally focused on WhatsApp, Evolution API has grown into a comprehensive platform supporting multiple messaging services and integrations. We continue to acknowledge CodeChat for laying the groundwork.

Today, Evolution API is not limited to WhatsApp. It integrates with various platforms such as Typebot, Chatwoot, Dify, and OpenAI, offering a broad array of functionalities beyond messaging. Evolution API supports both the Baileys-based WhatsApp API and the official WhatsApp Business API, with upcoming support for Instagram and Messenger.

## Looking for a Lightweight Version?
For those who need a more streamlined and performance-optimized version, check out [Evolution API Lite](https://github.com/EvolutionAPI/evolution-api-lite). It's designed specifically for microservices, focusing solely on connectivity without integrations or audio conversion features. Ideal for environments that prioritize simplicity and efficiency.

## Types of Connections

Evolution API supports multiple types of connections to WhatsApp, enabling flexible and powerful integration options:

- *WhatsApp API - Baileys*:
  - A free API based on WhatsApp Web, leveraging the [Baileys library](https://github.com/WhiskeySockets/Baileys).
  - This connection type allows control over WhatsApp Web functionalities through a RESTful API, suitable for multi-service chats, service bots, and other WhatsApp-integrated systems.
  - Note: This method relies on the web version of WhatsApp and may have limitations compared to official APIs.

- *WhatsApp Cloud API*:
  - The official API provided by Meta (formerly Facebook).
  - This connection type offers a robust and reliable solution designed for businesses needing higher volumes of messaging and better integration support.
  - The Cloud API supports features such as end-to-end encryption, advanced analytics, and more comprehensive customer service tools.
  - To use this API, you must comply with Meta's policies and potentially pay for usage based on message volume and other factors.

## Integrations

Evolution API supports various integrations to enhance its functionality. Below is a list of available integrations and their uses:

- [Typebot](https://typebot.io/):
  - Build conversational bots using Typebot, integrated directly into Evolution with trigger management.

- [Chatwoot](https://www.chatwoot.com/):
  - Direct integration with Chatwoot for handling customer service for your business.

- [RabbitMQ](https://www.rabbitmq.com/):
  - Receive events from the Evolution API via RabbitMQ.

- [Amazon SQS](https://aws.amazon.com/pt/sqs/):
  - Receive events from the Evolution API via Amazon SQS.

- [Socket.io](https://socket.io/):
  - Receive events from the Evolution API via WebSocket.

- [Dify](https://dify.ai/):
  - Integrate your Evolution API directly with Dify AI for seamless trigger management and multiple agents.

- [OpenAI](https://openai.com/):
  - Integrate your Evolution API with OpenAI for AI capabilities, including audio-to-text conversion, available across all Evolution integrations.

- Amazon S3 / Minio:
  - Store media files received in [Amazon S3](https://aws.amazon.com/pt/s3/) or [Minio](https://min.io/).

## Telemetry Notice

To continuously improve our services, we have implemented telemetry that collects data on the routes used, the most accessed routes, and the version of the API in use. We would like to assure you that no sensitive or personal data is collected during this process. The telemetry helps us identify improvements and provide a better experience for users.

## Evolution Support Premium

Join our Evolution Pro community for expert support and a weekly call to answer questions. Visit the link below to learn more and subscribe:

[Click here to learn more](https://evolution-api.com/suporte-pro)

# Donate to the project.

#### Github Sponsors

https://github.com/sponsors/EvolutionAPI

# Content Creator Partners

We are proud to collaborate with the following content creators who have contributed valuable insights and tutorials about Evolution API:

- [Promovaweb](https://www.youtube.com/@promovaweb)
- [Sandeco](https://www.youtube.com/@canalsandeco)
- [Comunidade ZDG](https://www.youtube.com/@ComunidadeZDG)
- [Francis MNO](https://www.youtube.com/@FrancisMNO)
- [Pablo Cabral](https://youtube.com/@pablocabral)
- [XPop Digital](https://www.youtube.com/@xpopdigital)
- [Costar Wagner Dev](https://www.youtube.com/@costarwagnerdev)
- [Dante Testa](https://youtube.com/@dantetesta_)
- [Rubén Salazar](https://youtube.com/channel/UCnYGZIE2riiLqaN9sI6riig)
- [OrionDesign](youtube.com/OrionDesign_Oficial)
- [IMPA 365](youtube.com/@impa365_ofc)
- [Comunidade Hub Connect](https://youtube.com/@comunidadehubconnect)
- [dSantana Automações](https://www.youtube.com/channel/UCG7DjUmAxtYyURlOGAIryNQ?view_as=subscriber)
- [Edison Martins](https://www.youtube.com/@edisonmartinsmkt)
- [Astra Online](https://www.youtube.com/@astraonlineweb)
- [MKT Seven Automações](https://www.youtube.com/@sevenautomacoes)
- [Vamos automatizar](https://www.youtube.com/vamosautomatizar)

## License

Evolution API is licensed under the Apache License 2.0, with the following additional conditions:

1. **LOGO and copyright information**: In the process of using Evolution API's frontend components, you may not remove or modify the LOGO or copyright information in the Evolution API console or applications. This restriction is inapplicable to uses of Evolution API that do not involve its frontend components.

2. **Usage Notification Requirement**: If Evolution API is used as part of any project, including closed-source systems (e.g., proprietary software), the user is required to display a clear notification within the system that Evolution API is being utilized. This notification should be visible to system administrators and accessible from the system's documentation or settings page. Failure to comply with this requirement may result in the necessity for a commercial license, as determined by the producer.

Please contact contato@evolution-api.com to inquire about licensing matters.

Apart from the specific conditions mentioned above, all other rights and restrictions follow the Apache License 2.0. Detailed information about the Apache License 2.0 can be found at [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0).

© 2024 Evolution API