using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Hosting.WindowsServices;
using Yarp.ReverseProxy.Configuration;

// GridLedger Dashboard: the part people use. It shows the screens and passes every data request to the
// GridLedger Engine (backend) with a secret gateway key. No AI logic and no plant data live here.
var appDir = AppContext.BaseDirectory;
var dataDir = Path.GetFullPath(Environment.GetEnvironmentVariable("GL_DASHBOARD_DATA_DIR") ?? Path.Combine(appDir, "data"));
Directory.CreateDirectory(dataDir);
var cfgFile = Path.Combine(dataDir, "appsettings.Local.json");

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = appDir });
builder.Configuration.AddJsonFile(cfgFile, optional: true, reloadOnChange: false);
builder.Host.UseWindowsService(o => o.ServiceName = "GridLedgerDashboard");
builder.Logging.AddSimpleConsole(o => { o.SingleLine = true; o.TimestampFormat = "HH:mm:ss "; });
Directory.CreateDirectory(Path.Combine(dataDir, "logs"));
builder.Logging.AddProvider(new GridLedger.Dashboard.FileLoggerProvider(Path.Combine(dataDir, "logs")));
if (!builder.Configuration.GetSection("Kestrel:Endpoints").Exists())
    builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("GL_URLS") ?? builder.Configuration["Urls"] ?? "http://127.0.0.1:8080");

string engineUrl = Environment.GetEnvironmentVariable("GL_ENGINE_URL") ?? builder.Configuration["EngineUrl"] ?? "";
string gatewayKey = Environment.GetEnvironmentVariable("GL_GATEWAY_KEY") ?? builder.Configuration["GatewayKey"] ?? "";

static (IReadOnlyList<RouteConfig>, IReadOnlyList<ClusterConfig>) ProxyConfig(string url, string key)
{
    var route = new RouteConfig
    {
        RouteId = "engine-api",
        ClusterId = "engine",
        Match = new RouteMatch { Path = "/api/{**rest}" },
        Transforms = [new Dictionary<string, string> { ["RequestHeader"] = "X-GridLedger-Gateway", ["Set"] = key }],
    };
    var cluster = new ClusterConfig
    {
        ClusterId = "engine",
        Destinations = new Dictionary<string, DestinationConfig> { ["main"] = new() { Address = string.IsNullOrEmpty(url) ? "http://127.0.0.1:9" : url } },
        HttpRequest = new Yarp.ReverseProxy.Forwarder.ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromSeconds(120) },
    };
    return ([route], [cluster]);
}

var (routes, clusters) = ProxyConfig(engineUrl, gatewayKey);
builder.Services.AddReverseProxy().LoadFromMemory(routes, clusters);
builder.Services.AddHttpClient();

var app = builder.Build();

app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    if (ctx.Request.IsHttps) h["Strict-Transport-Security"] = "max-age=31536000";
    await next();
});

bool IsLocal(HttpContext c) => c.Connection.RemoteIpAddress is { } ip && System.Net.IPAddress.IsLoopback(ip);

// Connection to the Engine (first start, or when the Engine moves to another server)
app.MapGet("/gateway/status", () => Results.Ok(new { connected = engineUrl.Length > 0, engineUrl = engineUrl.Length > 0 ? engineUrl : null }));
app.MapPost("/gateway/connect", async (ConnectReq r, HttpContext c, IHttpClientFactory http, InMemoryConfigProvider proxy) =>
{
    if (!IsLocal(c)) return Results.Json(new { error = "The Engine connection can only be changed on the Dashboard PC itself." }, statusCode: 403);
    var url = r.EngineUrl.Trim().TrimEnd('/');
    if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https"))
        return Results.BadRequest(new { error = "Engine address must look like http://127.0.0.1:8090 or https://server:8443" });
    if (u.Scheme == "http" && !u.IsLoopback)
        return Results.BadRequest(new { error = "An Engine on another computer must use https:// so data is encrypted on the network." });
    try
    {
        using var client = http.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(8);
        using var req = new HttpRequestMessage(HttpMethod.Get, url + "/api/status");
        req.Headers.Add("X-GridLedger-Gateway", r.GatewayKey.Trim());
        var resp = await client.SendAsync(req);
        if ((int)resp.StatusCode == 403) return Results.BadRequest(new { error = "The Engine refused the gateway key. Copy it again from the Engine settings file." });
        if (!resp.IsSuccessStatusCode) return Results.BadRequest(new { error = $"The Engine answered with an error ({(int)resp.StatusCode})." });
    }
    catch (Exception e) { return Results.BadRequest(new { error = "Cannot reach the Engine: " + e.Message }); }

    JsonObject cfg = File.Exists(cfgFile) ? (JsonNode.Parse(await File.ReadAllTextAsync(cfgFile)) as JsonObject ?? new()) : new();
    cfg["EngineUrl"] = url;
    cfg["GatewayKey"] = r.GatewayKey.Trim();
    await File.WriteAllTextAsync(cfgFile, cfg.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    engineUrl = url; gatewayKey = r.GatewayKey.Trim();
    var (rt, cl) = ProxyConfig(engineUrl, gatewayKey);
    proxy.Update(rt, cl);
    return Results.Ok(new { connected = true });
});

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = c =>
    {
        if (c.File.Name == "index.html") c.Context.Response.Headers["Cache-Control"] = "no-cache";
        else if (c.Context.Request.Path.StartsWithSegments("/assets")) c.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
    },
});
app.MapReverseProxy(p => p.Use(async (ctx, next) =>
{
    if (engineUrl.Length == 0)
    {
        ctx.Response.StatusCode = 503;
        await ctx.Response.WriteAsJsonAsync(new { error = "The Dashboard is not connected to a GridLedger Engine yet.", needsEngine = true });
        return;
    }
    await next();
}));
app.MapFallbackToFile("index.html");

app.Logger.LogInformation("GridLedger Dashboard started. Engine: {Engine}", engineUrl.Length > 0 ? engineUrl : "(not connected yet)");
await app.RunAsync();

record ConnectReq(string EngineUrl, string GatewayKey);
