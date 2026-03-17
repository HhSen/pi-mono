#!/usr/bin/env node
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { main } from "./main.js";

setGlobalDispatcher(new EnvHttpProxyAgent());
main(process.argv.slice(2));
