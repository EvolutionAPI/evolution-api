import { Configuration, OpenAIApi } from "openai"

import { config } from "../config"

const configuration = new Configuration({
  apiKey: config.openAI.apiToken,
})

export const openai = new OpenAIApi(configuration)


export class OpenAIService {
  constructor(
    private readonly apikey: String,
  ) {
  }

  private WaOpenai: OpenAIApi;

  public SetOpenai() {

    const configuration = new Configuration({
      apiKey: config.openAI.apiToken,
    })

    this.WaOpenai = new OpenAIApi(configuration)
  }

  public  openai() {

    return this.WaOpenai;
  }

}
