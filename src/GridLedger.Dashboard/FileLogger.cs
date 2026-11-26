namespace GridLedger.Dashboard;

/// <summary>Daily log files in data/logs (kept for support; 30 days).</summary>
public sealed class FileLoggerProvider(string dir) : ILoggerProvider
{
    static readonly object Gate = new();
    public ILogger CreateLogger(string category) => new L(dir, category);
    public void Dispose() { }

    sealed class L(string dir, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Information && !(category.StartsWith("Microsoft") && level < LogLevel.Warning);
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? ex, Func<TState, Exception?, string> fmt)
        {
            if (!IsEnabled(level)) return;
            var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss} [{level}] {category.Split('.').Last()}: {fmt(state, ex)}{(ex is null ? "" : " | " + ex)}";
            lock (Gate)
            {
                try
                {
                    File.AppendAllText(Path.Combine(dir, $"dashboard-{DateTime.Now:yyyy-MM-dd}.log"), line + Environment.NewLine);
                    if (DateTime.Now.Minute == 0)
                        foreach (var f in Directory.GetFiles(dir, "dashboard-*.log").Where(f => File.GetLastWriteTime(f) < DateTime.Now.AddDays(-30))) File.Delete(f);
                }
                catch { /* logging must never stop the plant software */ }
            }
        }
    }
}
