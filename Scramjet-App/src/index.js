import { createReadStream, existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";

import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const sitePath = fileURLToPath(
    new URL("../../", import.meta.url)
);

const publicPath = fileURLToPath(
    new URL("../public/", import.meta.url)
);

const pageFiles = {
    "/": "home.html",
    "/index.html": "index.html",
    "/home.html": "home.html",
    "/b.html": "b.html",
    "/g.html": "g.html",
    "/a.html": "a.html",
    "/c.html": "c.html",
    "/chat.html": "chat.html",
    "/st.html": "st.html"
};

const registerServiceWorkerPath = fileURLToPath(
    new URL("../public/register-sw.js", import.meta.url)
);

const serviceWorkerPath = fileURLToPath(
    new URL("../public/sw.js", import.meta.url)
);

const notFoundPagePath = fileURLToPath(
    new URL("../public/404.html", import.meta.url)
);

logging.set_level(logging.NONE);

Object.assign(wisp.options, {
    allow_udp_streams: false,
    hostname_blacklist: [
        /example\.com/
    ],
    dns_servers: [
        "1.1.1.3",
        "1.0.0.3"
    ]
});

const fastify = Fastify({

    serverFactory: (handler) => {

        return createHttpServer()

            .on("request", (req, res) => {

                const pagePath =
                    req.url?.split("?")[0] ?? "/";

                if (
                    pagePath === "/" ||
                    pagePath === "/index.html" ||
                    pagePath === "/home.html" ||
                    pagePath === "/b.html" ||
                    pagePath === "/g.html" ||
                    pagePath === "/a.html" ||
                    pagePath === "/c.html" ||
                    pagePath === "/chat.html" ||
                    pagePath === "/st.html"
                ) {

                    res.setHeader(
                        "Cross-Origin-Opener-Policy",
                        "same-origin"
                    );

                    res.setHeader(
                        "Cross-Origin-Embedder-Policy",
                        "require-corp"
                    );
                }

                handler(req, res);
            })

            .on("upgrade", (req, socket, head) => {

                if (
                    req.url?.endsWith("/wisp/")
                ) {

                    wisp.routeRequest(
                        req,
                        socket,
                        head
                    );

                    return;
                }

                socket.end();
            });
    }
});


function getPagePath(relativePath) {

    return fileURLToPath(
        new URL(
            `../../${relativePath}`,
            import.meta.url
        )
    );

}


function sendHtml(relativePath) {

    const fullPath =
        getPagePath(relativePath);

    return async (_request, reply) => {

        if (!existsSync(fullPath)) {

            return reply
                .code(404)
                .type(
                    "text/plain; charset=utf-8"
                )
                .send(
                    `Missing page: ${relativePath}`
                );
        }

        return reply
            .type(
                "text/html; charset=utf-8"
            )
            .send(
                createReadStream(fullPath)
            );
    };

}


function sendJavaScript(filePath) {

    return async (_request, reply) => {

        if (!existsSync(filePath)) {

            return reply
                .code(404)
                .type(
                    "text/plain; charset=utf-8"
                )
                .send(
                    "Missing JavaScript file"
                );
        }

        return reply
            .type(
                "application/javascript; charset=utf-8"
            )
            .send(
                createReadStream(filePath)
            );
    };

}


/*
 * HTML routes
 */

for (
    const [route, file]
    of Object.entries(pageFiles)
) {

    fastify.get(
        route,
        sendHtml(file)
    );

}


/*
 * Service worker routes
 */

fastify.get(
    "/register-sw.js",
    sendJavaScript(
        registerServiceWorkerPath
    )
);

fastify.get(
    "/sw.js",
    sendJavaScript(
        serviceWorkerPath
    )
);


/*
 * Main site files
 */

fastify.register(
    fastifyStatic,
    {
        root: sitePath,
        decorateReply: true,
        index: false
    }
);


/*
 * Scramjet
 */

fastify.register(
    fastifyStatic,
    {
        root: scramjetPath,
        prefix: "/scram/",
        decorateReply: false
    }
);


/*
 * libcurl transport
 */

fastify.register(
    fastifyStatic,
    {
        root: libcurlPath,
        prefix: "/libcurl/",
        decorateReply: false
    }
);


/*
 * BareMux
 */

fastify.register(
    fastifyStatic,
    {
        root: baremuxPath,
        prefix: "/baremux/",
        decorateReply: false
    }
);


/*
 * 404 page
 */

fastify.setNotFoundHandler(
    async (_request, reply) => {

        if (
            existsSync(
                notFoundPagePath
            )
        ) {

            return reply
                .code(404)
                .type(
                    "text/html; charset=utf-8"
                )
                .send(
                    createReadStream(
                        notFoundPagePath
                    )
                );
        }

        return reply
            .code(404)
            .type(
                "text/plain; charset=utf-8"
            )
            .send(
                "404 - Not Found"
            );
    }
);


/*
 * Server startup
 */

fastify.server.on(
    "listening",
    () => {

        const address =
            fastify.server.address();

        console.log(
            "Listening on:"
        );

        console.log(
            `\thttp://localhost:${address.port}`
        );

        console.log(
            `\thttp://${hostname()}:${address.port}`
        );

        console.log(
            `\thttp://${
                address.family === "IPv6"
                    ? `[${address.address}]`
                    : address.address
            }:${address.port}`
        );
    }
);


/*
 * Graceful shutdown
 */

async function shutdown() {

    console.log(
        "Closing HTTP server"
    );

    try {

        await fastify.close();

    } finally {

        process.exit(0);

    }
}


process.on(
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);


/*
 * Port
 */

const parsedPort =
    Number.parseInt(
        process.env.PORT ?? "8080",
        10
    );

const port =
    Number.isNaN(parsedPort)
        ? 8080
        : parsedPort;


/*
 * Start
 */

try {

    await fastify.listen({
        port,
        host: "0.0.0.0"
    });

} catch (error) {

    console.error(
        "Failed to start server:",
        error
    );

    process.exit(1);

}