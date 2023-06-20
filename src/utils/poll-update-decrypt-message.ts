// Built around ShellTear's POC at #2215#issuecomment-1292885678 on @adiwajshing/baileys
// Copyright ~ purpshell

import crypto from 'node:crypto';

const enc = new TextEncoder();
/**
 * Decrypt PollUpdate messages
 */
export class PollUpdateDecrypt {
  /**
   * Compare the SHA-256 hashes of the poll options from the update to find the original choices
   * @param options Options from the poll creation message
   * @param pollOptionHash hash from `this.decrypt()`
   * @returns the original option, can be empty when none are currently selected
   */
  static async compare(options: string[], pollOptionHashes: string[]): Promise<string[]> {
    const selectedOptions = [];
    for (const option of options) {
      const hash = Buffer.from(
        await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(option)),
      )
        .toString('hex')
        .toUpperCase();
      for (const pollOptionHash of pollOptionHashes) {
        if (pollOptionHash === hash) {
          selectedOptions.push(option);
        }
      }
    }
    return selectedOptions;
  }

  /**
   * decrypt a poll message update
   * @param encPayload from the update
   * @param encIv from the update
   * @param encKey from the original poll
   * @param pollMsgSender sender jid of the pollCreation message
   * @param pollMsgId id of the pollCreation message
   * @param voteMsgSender sender of the pollUpdate message
   * @returns The option or empty array if something went wrong OR everything was unticked
   */
  static async decrypt(
    encKey: Uint8Array,
    encPayload: Uint8Array,
    encIv: Uint8Array,
    pollMsgSender: string,
    pollMsgId: string,
    voteMsgSender: string,
  ): Promise<string[]> {
    const stanzaId = enc.encode(pollMsgId);
    const parentMsgOriginalSender = enc.encode(pollMsgSender);
    const modificationSender = enc.encode(voteMsgSender);
    const modificationType = enc.encode('Poll Vote');
    const pad = new Uint8Array([1]);

    const signMe = new Uint8Array([
      ...stanzaId,
      ...parentMsgOriginalSender,
      ...modificationSender,
      ...modificationType,
      pad,
    ] as any);

    const createSignKey = async (n: Uint8Array = new Uint8Array(32)) => {
      return await crypto.webcrypto.subtle.importKey(
        'raw',
        n,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
    };

    const sign = async (
      n: crypto.webcrypto.BufferSource,
      key: crypto.webcrypto.CryptoKey,
    ) => {
      return await crypto.webcrypto.subtle.sign(
        { name: 'HMAC', hash: 'SHA-256' },
        key,
        n,
      );
    };

    let key = await createSignKey();

    const temp = await sign(encKey, key);

    key = await createSignKey(new Uint8Array(temp));

    const decryptionKey = new Uint8Array(await sign(signMe, key));

    const additionalData = enc.encode(`${pollMsgId}\u0000${voteMsgSender}`);

    const decryptedMessage = await this._decryptMessage(
      encPayload,
      encIv,
      additionalData,
      decryptionKey,
    );

    const pollOptionHash = this._decodeMessage(decryptedMessage);

    // '0A20' in hex represents unicode " " and "\n" thus declaring the end of one option
    // we want multiple hashes to make it easier to iterate and understand for your use cases
    return pollOptionHash.split('0A20') || [];
  }

  /**
   * Internal method to decrypt the message after gathering all information
   * @deprecated Use `this.decrypt()` instead, only use this if you know what you are doing
   * @param encPayload
   * @param encIv
   * @param additionalData
   * @param decryptionKey
   * @returns
   */
  static async _decryptMessage(
    encPayload: Uint8Array,
    encIv: Uint8Array,
    additionalData: Uint8Array,
    decryptionKey: Uint8Array,
  ) {
    const tagSize_multiplier = 16;
    const encoded = encPayload;
    const key = await crypto.webcrypto.subtle.importKey(
      'raw',
      decryptionKey,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );
    const decrypted = await crypto.webcrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: encIv,
        additionalData: additionalData,
        tagLength: 8 * tagSize_multiplier,
      },
      key,
      encoded,
    );
    return new Uint8Array(decrypted).slice(2); // remove 2 bytes (OA20)(space+newline)
  }

  /**
   * Decode the message from `this._decryptMessage()`
   * @param decryptedMessage the message from `this._decrpytMessage()`
   * @returns
   */
  static _decodeMessage(decryptedMessage: Uint8Array) {
    const n = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66, 67, 68, 69, 70];
    const outarr: number[] = [];

    for (let i = 0; i < decryptedMessage.length; i++) {
      const val = decryptedMessage[i];
      outarr.push(n[val >> 4], n[15 & val]);
    }

    return String.fromCharCode(...outarr);
  }
}
