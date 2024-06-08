<h1 align="center">Evolution Api</h1>

<div align="center">

[![Whatsapp Group](https://img.shields.io/badge/Group-WhatsApp-%2322BC18)](https://evolution-api.com/whatsapp)
[![Discord Community](https://img.shields.io/badge/Discord-Community-blue)](https://evolution-api.com/discord)
[![Postman Collection](https://img.shields.io/badge/Postman-Collection-orange)](https://evolution-api.com/postman) 
[![Documentation](https://img.shields.io/badge/Documentation-Official-green)](https://doc.evolution-api.com)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](./LICENSE)
[![Support](https://img.shields.io/badge/Donation-picpay-green)](https://app.picpay.com/user/davidsongomes1998)
[![Support](https://img.shields.io/badge/Buy%20me-coffe-orange)](https://bmc.link/evolutionapi)

</div>
  
<div align="center"><img src="./public/images/cover.png"></div>

## Evolution API - Whatsapp API Node JS

This project is based on the [CodeChat](https://github.com/code-chat-br/whatsapp-api). The original project is an implementation of [Baileys](https://github.com/WhiskeySockets/Baileys), serving as a Restful API service that controls WhatsApp functions.</br> 
The code allows the creation of multiservice chats, service bots, or any other system that utilizes WhatsApp. The documentation provides instructions on how to set up and use the project, as well as additional information about its features and configuration options.

The Evolution API has direct integration with [Typebot](https://github.com/baptisteArno/typebot.io) and [Chatwoot](https://github.com/chatwoot/chatwoot)

## Evolution Pro Community

Join our Evolution Pro community for expert support and a weekly call to answer questions. Visit the link below to learn more and subscribe:

[Click here to learn more](https://pay.kiwify.com.br/SzPrarM)
<br>
<a href="https://pay.kiwify.com.br/SzPrarM">
  <img src="./public/images/evolution-pro.png" alt="Subscribe" width="600">
</a>

# Instalation

### Installing NVM (Node Version Manager)

NVM allows you to install and manage multiple versions of Node.js. This is particularly useful for maintaining compatibility across different projects.

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

source ~/.bashrc

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Installing Node.js

```sh
nvm install v20.10.0 && nvm use v20.10.0
```

### Initializing the Application

Clone the repository:

```sh
git clone https://github.com/EvolutionAPI/evolution-api.git
```
Configure the environment variables in the [.env](./.env.example) file.

### Installing Application Dependencies

```sh
cd evolution-api

npm install

npm run build
```

### Env
> OBS: Rename the [.env.example](./.env.example) file to **.env**
```sh
cp .env.example .env
```
### Database Setup

The application supports PostgreSQL, MySQL, MariaDB.

Run one of the commands below for the non-existence of a database.

  - **MySQL or MariaDB**:

    ```sh
    npx prisma migrate dev --name init --schema ./prisma/mysql-schema.prisma
    ```

  - **PostgreSQL**:
    ```sh
    npx prisma migrate dev --name init --schema ./prisma/postgresql-schema.prisma
    ```

#### Deploying

> For production environments.

For existing relational databases such as PostgreSQL, MySQL, or MariaDB, the setup involves two essential steps:

1. **Setting the Environment Variable**: Initially, it's imperative to define the `DATABASE_PROVIDER` environment variable in alignment with your relational database type. Use `postgresql` for PostgreSQL, and `mysql` for MySQL or MariaDB. This configuration is crucial as it directs the Prisma ORM regarding the specific relational database in use.

2. **Deploying Schema Changes**: Following this, execute the `npx prisma migrate deploy --schema ./prisma/postgresql-schema.prisma` command. This command serves as a shortcut for the `prisma deploy` command, whose main role is to examine the current schema of the relational database and implement necessary modifications. A key feature of this command is its ability to update the database schema without affecting the existing data. This ensures that your current data remains intact while the database schema is updated to meet the latest requirements of the application.

#### Prisma Studio

- **View your data**
  ```sh
  npx prisma studio --schema ./prisma/mysql-schema.prisma
  # or
  npx prisma studio --schema ./prisma/postgresql-schema.prisma
  ```

This will sync your data models to your database, creating tables as needed.

### Running the Application

- **Development Mode**:

  ```sh
  npm run dev:server
  ```

- **Production Mode**:

  ```sh
  npm run build
  npm run start:prod
  ```

# Note

This code is in no way affiliated with WhatsApp. Use at your own discretion. Don't spam this.

This code was produced based on the baileys library and it is still under development.

# Donate to the project.

#### PicPay

<div align="center">
  <a href="https://app.picpay.com/user/davidsongomes1998" target="_blank" rel="noopener noreferrer">
    <img src="./public/images/picpay-qr.jpeg" style="width: 50% !important;">
  </a>
</div>

#### Buy me coffe - PIX

<div align="center">
  <a href="https://bmc.link/evolutionapi" target="_blank" rel="noopener noreferrer">
    <img src="./public/images/qrcode-pix.png" style="width: 50% !important;">
  </a>
  <p><b>CHAVE PIX (Telefone):</b> (74)99987-9409</p>
</div>

</br>