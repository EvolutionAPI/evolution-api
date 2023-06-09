# 1.0.8 (2023-06-09)

### Features

* Added Docker compose file
* Added ChangeLog file

# 1.0.7 (2023-06-08)

### Features

* Ghost mention
* Mention in reply
* Profile photo change
* Profile name change
* Profile status change
* Sending a poll
* Creation of LinkPreview if message contains URL
* New webhooks system, which can be separated into a url per event
* Sending the local webhook url as destination in the webhook data for webhook redirection
* Startup modes, server or container
* Server Mode works normally as everyone is used to
* Container mode made to use one instance per container, when starting the application an instance is already created and the qrcode is generated and it starts sending webhook without having to call it manually, it only allows one instance at a time.