using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using PlanningPiscine.Data;
using PlanningPiscine.Services;
using PlanningPiscine.Models;
using System.Security.Cryptography;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
  options.UseMySql(
    builder.Configuration.GetConnectionString("DefaultConnection"),
    new MySqlServerVersion(new Version(8, 0, 0))
  )
);

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
  .AddCookie(options => {
    options.LoginPath         = "/";
    options.ExpireTimeSpan    = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = ctx => {
      ctx.Response.StatusCode = 401;
      return Task.CompletedTask;
    };
  });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddHostedService<AlertService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope()) {
  var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
  db.Database.Migrate();

  if (!db.Users.Any()) {
    var hash = Convert.ToHexString(
      SHA256.HashData(Encoding.UTF8.GetBytes("Centro!Minerva@"))
    ).ToLower();

    db.Users.Add(new User {
      LoginName    = "Admin",
      FullName     = "Admin",
      Email        = "",
      Phone        = "",
      PasswordHash = hash,
      IsSuspended  = false,
      Color        = 0,
      Roles        = UserRoles.Admin,
      StructureId  = 1
    });

    db.SaveChanges();
  }
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
