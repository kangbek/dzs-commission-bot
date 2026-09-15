require("dotenv").config();
const {
 Client, GatewayIntentBits, PermissionsBitField, ChannelType,
 EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
 ModalBuilder, TextInputBuilder, TextInputStyle, REST, Routes,
 SlashCommandBuilder
} = require("discord.js");
const Database=require("better-sqlite3");
const fs=require("fs");

const required=["DISCORD_TOKEN","CLIENT_ID","GUILD_ID","TICKET_CATEGORY_ID","FEEDBACK_CHANNEL_ID","LOG_CHANNEL_ID","STAFF_ROLE_ID"];
for(const k of required) if(!process.env[k]){console.error("Missing "+k);process.exit(1);}
fs.mkdirSync("data",{recursive:true});
const db=new Database("data/commission.sqlite");
db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS tickets(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT,user_id TEXT,channel_id TEXT,order_id TEXT,type TEXT,description TEXT,status TEXT,created_at TEXT,closed_at TEXT
);
CREATE TABLE IF NOT EXISTS reviews(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT,user_id TEXT,order_id TEXT,commission TEXT,rating INTEGER,comment TEXT,created_at TEXT
);
CREATE TABLE IF NOT EXISTS settings(guild_id TEXT PRIMARY KEY,locked INTEGER DEFAULT 0);
`);

const commands=[
 new SlashCommandBuilder().setName("commission").setDescription("Buka ticket commission."),
 new SlashCommandBuilder().setName("setup-commission").setDescription("Buat panel ticket commission."),
 new SlashCommandBuilder().setName("feedback").setDescription("Buka panel feedback."),
 new SlashCommandBuilder().setName("setup-feedback").setDescription("Buat panel feedback."),
 new SlashCommandBuilder().setName("stats").setDescription("Lihat statistik rating."),
 new SlashCommandBuilder().setName("myfeedback").setDescription("Lihat feedback terakhir kamu."),
 new SlashCommandBuilder().setName("order-status").setDescription("Ubah status order ticket.")
  .addStringOption(o=>o.setName("status").setDescription("Status").setRequired(true)
   .addChoices(
    {name:"Open",value:"open"},{name:"Progress",value:"progress"},
    {name:"Waiting",value:"waiting"},{name:"Completed",value:"completed"})),
 new SlashCommandBuilder().setName("close-ticket").setDescription("Tutup ticket commission."),
 new SlashCommandBuilder().setName("feedback-delete").setDescription("Hapus review.")
  .addIntegerOption(o=>o.setName("id").setDescription("Review ID").setRequired(true)),
 new SlashCommandBuilder().setName("feedback-lock").setDescription("Kunci/buka feedback.")
  .addBooleanOption(o=>o.setName("locked").setDescription("true=kunci").setRequired(true))
].map(x=>x.toJSON());

const client=new Client({intents:[GatewayIntentBits.Guilds]});
const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);

function admin(i){
 return i.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ||
 !!(process.env.STAFF_ROLE_ID && i.member?.roles?.cache?.has(process.env.STAFF_ROLE_ID));
}
function staffRole(){return process.env.STAFF_ROLE_ID;}
function stars(n){return "⭐".repeat(n)+"☆".repeat(5-n);}
function locked(g){
 return db.prepare("SELECT locked FROM settings WHERE guild_id=?").get(g)?.locked===1;
}
async function log(g,text){
 const c=await g.channels.fetch(process.env.LOG_CHANNEL_ID).catch(()=>null);
 if(c?.isTextBased()) c.send(text).catch(()=>{});
}
function ticketPanel(){
 return new EmbedBuilder().setTitle("🎨 COMMISSION CENTER")
 .setDescription("Butuh commission? Klik **Open Commission** untuk membuat ticket private dengan staff.")
 .addFields(
  {name:"📦 Proses",value:"1. Buka ticket\\n2. Jelaskan request\\n3. Staff konfirmasi harga\\n4. Pengerjaan\\n5. Selesai → feedback ⭐"},
  {name:"🔒 Privacy",value:"Ticket hanya dapat dilihat customer dan staff."})
 .setFooter({text:"Commission Ticket System"}).setTimestamp();
}
function ticketRow(){
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("open_commission").setLabel("🎨 Open Commission").setStyle(ButtonStyle.Primary)
 );
}
function feedbackPanel(){
 return new EmbedBuilder().setTitle("⭐ COMMISSION FEEDBACK")
 .setDescription("Berikan penilaian setelah commission selesai. Pilih rating 1–5.")
 .setFooter({text:"Commission Feedback System"});
}
function feedbackRow(){
 return new ActionRowBuilder().addComponents(
  ...[1,2,3,4,5].map(n=>new ButtonBuilder().setCustomId("rate_"+n).setLabel("⭐ "+n)
   .setStyle(n>=4?ButtonStyle.Success:n===3?ButtonStyle.Primary:ButtonStyle.Secondary))
 );
}
function feedbackModal(rating){
 return new ModalBuilder().setCustomId("feedback_"+rating).setTitle("Commission Feedback "+rating+"/5")
 .addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("order").setLabel("Order ID").setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("commission").setLabel("Nama Commission").setStyle(TextInputStyle.Short).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("comment").setLabel("Feedback").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))
 );
}
function reviewEmbed(r){
 return new EmbedBuilder().setTitle("⭐ COMMISSION REVIEW #"+r.id)
 .addFields(
  {name:"👤 Customer",value:"<@"+r.user_id+">",inline:true},
  {name:"🔢 Order ID",value:r.order_id,inline:true},
  {name:"🎨 Commission",value:r.commission},
  {name:"⭐ Rating",value:stars(r.rating)+" **"+r.rating+"/5**"},
  {name:"💬 Feedback",value:r.comment})
 .setTimestamp(new Date(r.created_at)).setFooter({text:"Review #"+r.id});
}

client.once("ready",async()=>{
 console.log("Logged in as "+client.user.tag);
 await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{body:commands});
 console.log("Commands registered.");
});

client.on("interactionCreate",async i=>{
 try{
  if(i.isChatInputCommand()){
   if(i.commandName==="commission"){
    return i.reply({embeds:[ticketPanel()],components:[ticketRow()]});
   }
   if(i.commandName==="setup-commission"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    await i.channel.send({embeds:[ticketPanel()],components:[ticketRow()]});
    return i.reply({content:"✅ Commission panel dibuat.",ephemeral:true});
   }
   if(i.commandName==="setup-feedback"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    await i.channel.send({embeds:[feedbackPanel()],components:[feedbackRow()]});
    return i.reply({content:"✅ Feedback panel dibuat.",ephemeral:true});
   }
   if(i.commandName==="feedback"){
    if(locked(i.guildId))return i.reply({content:"🔒 Feedback sedang dikunci.",ephemeral:true});
    return i.reply({embeds:[feedbackPanel()],components:[feedbackRow()]});
   }
   if(i.commandName==="stats"){
    const a=db.prepare("SELECT COUNT(*) total,AVG(rating) avg FROM reviews WHERE guild_id=?").get(i.guildId);
    const rows=db.prepare("SELECT rating,COUNT(*) c FROM reviews WHERE guild_id=? GROUP BY rating").all(i.guildId);
    const c=Object.fromEntries(rows.map(x=>[x.rating,x.c]));
    let d="";for(let n=5;n>=1;n--)d+=stars(n)+"  "+(c[n]||0)+"\\n";
    return i.reply({embeds:[new EmbedBuilder().setTitle("📊 COMMISSION STATISTICS")
     .addFields(
      {name:"⭐ Average",value:`**${a.total?(+a.avg).toFixed(2):"0.00"} / 5.00**`,inline:true},
      {name:"📝 Reviews",value:`**${a.total}**`,inline:true},
      {name:"Distribution",value:d||"Belum ada review."})]});
   }
   if(i.commandName==="myfeedback"){
    const r=db.prepare("SELECT * FROM reviews WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 1").get(i.guildId,i.user.id);
    return i.reply(r?{embeds:[reviewEmbed(r)],ephemeral:true}:{content:"📭 Belum ada feedback.",ephemeral:true});
   }
   if(i.commandName==="order-status"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    const t=db.prepare("SELECT * FROM tickets WHERE channel_id=?").get(i.channelId);
    if(!t)return i.reply({content:"❌ Command ini hanya untuk ticket.",ephemeral:true});
    const s=i.options.getString("status");
    db.prepare("UPDATE tickets SET status=? WHERE id=?").run(s,t.id);
    await i.channel.send(`📌 **Order #${t.id} (${t.order_id})** status: **${s.toUpperCase()}**`);
    return i.reply({content:"✅ Status diperbarui.",ephemeral:true});
   }
   if(i.commandName==="close-ticket"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    const t=db.prepare("SELECT * FROM tickets WHERE channel_id=?").get(i.channelId);
    if(!t)return i.reply({content:"❌ Bukan ticket commission.",ephemeral:true});
    db.prepare("UPDATE tickets SET status='completed',closed_at=? WHERE id=?").run(new Date().toISOString(),t.id);
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("rate_5").setLabel("⭐ Give Feedback").setStyle(ButtonStyle.Success)
    );
    await i.channel.send({embeds:[new EmbedBuilder().setTitle("✅ COMMISSION COMPLETED")
      .setDescription(`Order **${t.order_id}** selesai. Terima kasih!\\n\\nSilakan berikan feedback setelah ticket ditutup.`)],components:[row]});
    await log(i.guild,`✅ Ticket #${t.id} (${t.order_id}) completed by ${i.user.tag}`);
    setTimeout(()=>i.channel.delete("Commission completed").catch(()=>{}),15000);
    return i.reply({content:"✅ Ticket akan ditutup dalam 15 detik.",ephemeral:true});
   }
   if(i.commandName==="feedback-delete"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    const id=i.options.getInteger("id");const r=db.prepare("SELECT * FROM reviews WHERE id=? AND guild_id=?").get(id,i.guildId);
    if(!r)return i.reply({content:"❌ Review tidak ditemukan.",ephemeral:true});
    db.prepare("DELETE FROM reviews WHERE id=?").run(id);
    return i.reply({content:`🗑️ Review #${id} dihapus.`,ephemeral:true});
   }
   if(i.commandName==="feedback-lock"){
    if(!admin(i))return i.reply({content:"❌ Staff/Admin only.",ephemeral:true});
    const l=i.options.getBoolean("locked");
    db.prepare("INSERT INTO settings(guild_id,locked) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET locked=excluded.locked").run(i.guildId,l?1:0);
    return i.reply(`🔒 Feedback **${l?"DIKUNCI":"DIBUKA"}**.`);
   }
  }

  if(i.isButton() && i.customId==="open_commission"){
   const existing=db.prepare("SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND status NOT IN ('completed','closed')").get(i.guildId,i.user.id);
   if(existing)return i.reply({content:`❌ Kamu masih punya ticket aktif: <#${existing.channel_id}>`,ephemeral:true});
   const modal=new ModalBuilder().setCustomId("commission_modal").setTitle("New Commission")
    .addComponents(
     new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("type").setLabel("Jenis Commission").setPlaceholder("Minecraft Skin / Render / Logo").setStyle(TextInputStyle.Short).setRequired(true)),
     new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("desc").setLabel("Jelaskan Request").setPlaceholder("Tuliskan detail yang kamu inginkan").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500))
    );
   return i.showModal(modal);
  }

  if(i.isButton() && i.customId.startsWith("rate_")){
   if(locked(i.guildId))return i.reply({content:"🔒 Feedback sedang dikunci.",ephemeral:true});
   const rating=Number(i.customId.split("_")[1]);
   return i.showModal(feedbackModal(rating));
  }

  if(i.isModalSubmit() && i.customId==="commission_modal"){
   const type=i.fields.getTextInputValue("type").trim();
   const desc=i.fields.getTextInputValue("desc").trim();
   const order="COM-"+Date.now().toString().slice(-6);
   const name=`ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,12)||"customer"}`;
   const ch=await i.guild.channels.create({
    name,
    type:ChannelType.GuildText,
    parent:process.env.TICKET_CATEGORY_ID,
    topic:`Commission ${order} | Customer ${i.user.id}`,
    permissionOverwrites:[
     {id:i.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
     {id:i.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
     {id:staffRole(),allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory,PermissionsBitField.Flags.ManageMessages]}
    ]
   });
   const result=db.prepare("INSERT INTO tickets(guild_id,user_id,channel_id,order_id,type,description,status,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(i.guildId,i.user.id,ch.id,order,type,desc,"open",new Date().toISOString());
   await ch.send({content:`<@${i.user.id}> <@&${staffRole()}>`,embeds:[
    new EmbedBuilder().setTitle("🎫 COMMISSION TICKET")
     .addFields(
      {name:"🔢 Order ID",value:order,inline:true},
      {name:"👤 Customer",value:`<@${i.user.id}>`,inline:true},
      {name:"🎨 Type",value:type},
      {name:"📝 Request",value:desc},
      {name:"📌 Status",value:"OPEN"})
     .setFooter({text:`Ticket #${result.lastInsertRowid}`}).setTimestamp()
   ]});
   await log(i.guild,`🎫 New ticket ${order} by ${i.user.tag}`);
   return i.reply({content:`✅ Ticket dibuat: ${ch}`,ephemeral:true});
  }

  if(i.isModalSubmit() && i.customId.startsWith("feedback_")){
   const rating=Number(i.customId.split("_")[1]);
   const order=i.fields.getTextInputValue("order").trim();
   const commission=i.fields.getTextInputValue("commission").trim();
   const comment=i.fields.getTextInputValue("comment").trim();
   const result=db.prepare("INSERT INTO reviews(guild_id,user_id,order_id,commission,rating,comment,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(i.guildId,i.user.id,order,commission,rating,comment,new Date().toISOString());
   const r=db.prepare("SELECT * FROM reviews WHERE id=?").get(result.lastInsertRowid);
   const ch=await i.guild.channels.fetch(process.env.FEEDBACK_CHANNEL_ID).catch(()=>null);
   if(ch?.isTextBased())await ch.send({embeds:[reviewEmbed(r)]});
   return i.reply({content:`✅ Feedback **#${r.id}** berhasil dikirim. Terima kasih!`,ephemeral:true});
  }
 }catch(e){
  console.error(e);
  if(i.isRepliable()&&!i.replied&&!i.deferred)i.reply({content:"❌ Terjadi error pada bot.",ephemeral:true}).catch(()=>{});
 }
});
client.login(process.env.DISCORD_TOKEN);
