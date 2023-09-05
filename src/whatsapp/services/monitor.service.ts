  public async instanceInfo(instanceName?: string) {
    this.logger.verbose('get instance info');

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    const instances: any[] = await Promise.all(
      Object.entries(this.waInstances).map(async ([key, value]) => {
        const status = value?.connectionStatus?.state || 'unknown';

        if (status === 'unknown') {
          return null;
        }

        if (status === 'open') {
          this.logger.verbose('instance: ' + key + ' - connectionStatus: open');
        }

        const instanceData: any = {
          instance: {
            instanceName: key,
            owner: value.wuid,
            profileName: (await value.getProfileName()) || 'not loaded',
            profilePictureUrl: value.profilePictureUrl,
            profileStatus: (await value.getProfileStatus()) || '',
            status: status,
          },
        };

        if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES) {
          instanceData.instance.serverUrl = urlServer;
          instanceData.instance.apikey = (await this.repository.auth.find(key))?.apikey;

          const findChatwoot = await this.waInstances[key].findChatwoot();
          if (findChatwoot && findChatwoot.enabled) {
            instanceData.instance.chatwoot = {
              ...findChatwoot,
              webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(key)}`,
            };
          }
        }

        return instanceData;
      }),
    ).then((results) => results.filter((instance) => instance !== null));

    this.logger.verbose('return instance info: ' + instances.length);

    if (instanceName) {
      const instance = instances.find((i) => i.instance.instanceName === instanceName);
      return instance || [];
    }

    return instances;
  }
