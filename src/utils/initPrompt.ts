import { promptPizza } from "../prompts/pizzaAgent"

export function initPrompt(storeName: string, orderCode: string, prompt?: string ): string {
  if(prompt){
    return prompt
      .replace(/{{[\s]?storeName[\s]?}}/g, storeName)
      .replace(/{{[\s]?orderCode[\s]?}}/g, orderCode)
  }else{
    return promptPizza
      .replace(/{{[\s]?storeName[\s]?}}/g, storeName)
      .replace(/{{[\s]?orderCode[\s]?}}/g, orderCode)
  }
}
