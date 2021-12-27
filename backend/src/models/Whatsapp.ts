import { sign } from "jsonwebtoken";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  Unique,
  ForeignKey,
  BelongsTo,
  AfterUpdate,
  BeforeCreate,
  BeforeUpdate
  // DefaultScope
} from "sequelize-typescript";
import webHooks from "../config/webHooks.dev.json";

import authConfig from "../config/auth";

import Queue from "../libs/Queue";
import ApiConfig from "./ApiConfig";
import Tenant from "./Tenant";
import Ticket from "./Ticket";

// @DefaultScope(() => ({
//   where: { isDeleted: false }
// }))
@Table
class Whatsapp extends Model<Whatsapp> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull
  @Unique
  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.TEXT)
  session: string;

  @Column(DataType.TEXT)
  qrcode: string;

  @Column
  status: string;

  @Column
  battery: string;

  @Column
  plugged: boolean;

  @Default(true)
  @Column
  isActive: boolean;

  @Default(false)
  @Column
  isDeleted: boolean;

  @Column
  retries: number;

  @Default(false)
  @AllowNull
  @Column
  isDefault: boolean;

  @Default(null)
  @AllowNull
  @Column
  tokenTelegram: string;

  @Default(null)
  @AllowNull
  @Column
  instagramUser: string;

  @Default(null)
  @AllowNull
  @Column
  instagramKey: string;

  @Default("whatsapp")
  @Column(DataType.ENUM("whatsapp", "telegram", "instagram"))
  type: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column
  number: string;

  @Column(DataType.JSONB)
  // eslint-disable-next-line @typescript-eslint/ban-types
  phone: object;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @ForeignKey(() => Tenant)
  @Column
  tenantId: number;

  @BelongsTo(() => Tenant)
  tenant: Tenant;

  @Default(null)
  @AllowNull
  @Column(DataType.ENUM("360", "gupshup"))
  wabaBSP: string;

  @Default(null)
  @AllowNull
  @Column(DataType.TEXT)
  wabaApiKey: string;

  @Default(null)
  @AllowNull
  @Column(DataType.TEXT)
  wabaKeyHook: string;

  @Column(DataType.VIRTUAL)
  get UrlWabaWebHook(): string | null {
    const key = this.getDataValue("wabaKeyHook");
    const wabaBSP = this.getDataValue("wabaBSP");
    let BACKEND_URL;
    BACKEND_URL = process.env.BACKEND_URL;
    if (process.env.NODE_ENV === "dev") {
      BACKEND_URL = webHooks.urlWabahooks;
    }
    return `${BACKEND_URL}/wabahooks/${wabaBSP}/${key}`;
  }

  @AfterUpdate
  static async HookStatus(instance: Whatsapp & any): Promise<void> {
    const statusHook = ["DESTROYED", "DISCONNECTED", "CONNECTED"];

    if (
      statusHook.includes(instance.status) &&
      // eslint-disable-next-line no-underscore-dangle
      instance._previousDataValues.status !== instance.status
    ) {
      const messages: any = {
        DESTROYED:
          "Desconectado devido à várias tentativas de extabelecimento da conexão sem sucesso. Verifique o celular e internet do aparelho.",
        DISCONNECTED:
          "Desconectado por: Telefone sem internet / Número despareado / Utilizado no whatsapp web.",
        CONNECTED: "Sessão conectada."
      };
      const { status, name, number, tenantId, id: sessionId } = instance;
      const payload = {
        name,
        number,
        status,
        timestamp: Date.now(),
        msg: messages[status],
        type: "hookSessionStatus"
      };

      const apiConfig = await ApiConfig.findAll({
        where: { tenantId, sessionId }
      });

      if (!apiConfig) return;

      await Promise.all(
        apiConfig.map((api: ApiConfig) => {
          return Queue.add("WebHooksAPI", {
            url: api.urlServiceStatus,
            type: payload.type,
            payload
          });
        })
      );
    }
  }

  @BeforeUpdate
  @BeforeCreate
  static async CreateWabaKeyWebHook(instance: Whatsapp): Promise<void> {
    const { secret } = authConfig;

    if (!instance?.wabaKeyHook && instance.type === "waba") {
      const wabaKeyHook = sign(
        {
          tenantId: instance.tenantId,
          whatsappId: instance.id
          // wabaBSP: instance.wabaBSP
        },
        secret,
        {
          expiresIn: "1000d"
        }
      );

      instance.wabaKeyHook = wabaKeyHook;
    }
  }
}

export default Whatsapp;
