module.exports = {
    apps : [
        {
            name: "signal",
            script: "./dist/run-uws-signal.js",
            args: "./config/config.json",
            max_memory_restart: "3700M",
        },
    ]
}
