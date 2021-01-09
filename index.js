require("dotenv").config()
const {app: electron, BrowserWindow, Menu, shell} = require("electron")
const axios = require("axios")
const csvToJson = require('csvtojson')
const ejs = require("ejs")
const express = require("express")
const fs = require('fs')
const http = require("http")
const multer = require("multer")
const path = require('path')
const puppeteer = require("puppeteer-core")
const socket = require("socket.io")

// import file
const docs = require(path.join(__dirname, "docs.json"))

// mutable var
let browser, page, window, popup, loggedIn = false

// read .env data
const {BROWSER_PORT, APP_PORT, NODE_ENV} = process.env

// directory path
const accountsPath = NODE_ENV === "development"
    ? path.join(__dirname, "src", "accounts")
    : electron.getPath("userData")
const filesPath = NODE_ENV === "development"
    ? path.join(__dirname, "src", "files")
    : electron.getPath("temp")
const publicPath = path.join(__dirname, "src", "public")
const viewsPath = path.join(__dirname, "src", "views")

// set base url server
const BASE_URL = "http://localhost:" + (APP_PORT || "8080")
const BROWSER_URL = "http://localhost:" + (BROWSER_PORT || "8081")

// init app and server
const app = express()
const server = http.createServer(app)
const io = socket(server)

// setup storage files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, filesPath)
    },
    filename: function (req, file, cb) {
        cb(
            null,
            file.fieldname + "-" + Date.now() + path.extname(file.originalname)
        )
    },
})
const upload = multer({storage})

// using middleware
app.use(express.json())
app.use(express.urlencoded())
app.use(express.raw())
app.use(express.static(publicPath))

// set engine and directory
app.engine(".html", ejs.__express)
app.set("views", viewsPath)
app.set("view engine", "html")

// set port debugging browser
electron.commandLine.appendSwitch('remote-debugging-port', BROWSER_PORT || '8315')

// setup function
const broadcast = (message) => io.emit("message", message)
const createMainWindow = async () => {
    window = new BrowserWindow({
        width: 360,
        height: 640,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
        },
        maxWidth: 360,
        maxHeight: 640,
        x: 0,
        y: 0
    })

    await window.loadURL(BASE_URL)

    const {data: {webSocketDebuggerUrl}} = await axios.get(BROWSER_URL + '/json/version');
    browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        slowMo: true,
        defaultViewport: null
    })

    window.on("closed", () => {
        if (process.platform !== 'darwin') {
            electron.quit()
        }
    })
}
const createPuppeteerWindow = async () => {
    popup = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
        },
        x: 400,
        y: 0,
        closable: false
    })

    await popup.loadURL("https://google.com")

    const pages = await browser.pages()
    for (const tab of pages) {
        const url = await tab.title()
        if (url === 'Google') page = tab
    }

    popup.on("closed", () => {
        page = null
        popup = null
    })
}
const getLoginResolver = async (req, res) => {
    if (loggedIn) return res.redirect("/")
    let accounts = []
    const files = fs.readdirSync(accountsPath)
    files.forEach(file => {
        if (file.endsWith(".data.json")) accounts.push(file.replace(".data.json", ""))
    })
    res.render("login", {title: "Login", accounts})
}
const getRegisterResolver = async (req, res) => {
    if (loggedIn) return res.redirect("/")
    res.render("register", {title: "Register"})
}
const getDocsResolver = async (req, res) => {
    res.render("docs", {title: "Documentation", docs})
}
const getLogoutResolver = async (req, res) => {
    await logoutFromOlx()
    await setTimeout(async () => {
        res.redirect("/")
    }, 5000)
}
const getHomeResolver = async (req, res) => {
    if (!loggedIn) return res.redirect("/login")
    res.render("home", {title: "Home"})
}
const postLoginResolver = async (req, res) => {
    const options = {encoding: "utf8", flag: "r"}
    const rawAccount = await fs.readFileSync(path.join(accountsPath, `${req.body.account}.data.json`), options)
    const data = JSON.parse(rawAccount)
    const error = await loginToOlx(data)
    await setTimeout(async () => {
        if (error) {
            await page.close()
        }
        res.redirect("/")
        io.emit("redirect", "/")
    }, 5000)
}
const postRegisterResolver = async (req, res) => {
    const {name, email, password} = req.body;
    if (!name) return res.render("register", {title: "Register"})
    if (!email) return res.render("register", {title: "Register"})
    if (!password) return res.render("register", {title: "Register"})
    const data = JSON.stringify(req.body, null, 2)
    await fs.writeFileSync(path.join(accountsPath, `${name}.data.json`), data)
    res.redirect("/")
}
const postRemoveResolver = async (req, res) => {
    const {account: name} = req.body
    fs.unlinkSync(path.join(accountsPath, `${name}.data.json`))
    res.redirect("/")
}
const postHomeResolver = async (req, res) => {
    const file = req.file ? req.file.path : ''
    if (!file || !loggedIn) return res.redirect("/")
    try {
        const lists = await csvToJson().fromFile(file);
        let i = 0
        for (const list of lists) {
            try {
                i += 1
                const {
                    tipe,
                    ac,
                    swimmingPool,
                    carport,
                    garden,
                    garage,
                    telephone,
                    pam,
                    waterHeater,
                    refrigerator,
                    stove,
                    microwave,
                    oven,
                    fireExtinguisher,
                    gordyn,
                    sertifikasi
                } = list;
                let fasilitas = [], images = [];
                if (ac === '1') fasilitas.push(1);
                if (swimmingPool === '1') fasilitas.push(2);
                if (carport === '1') fasilitas.push(3);
                if (garden === '1') fasilitas.push(4);
                if (garage === '1') fasilitas.push(5);
                if (telephone === '1') fasilitas.push(6);
                if (pam === '1') fasilitas.push(7);
                if (waterHeater === '1') fasilitas.push(8);
                if (refrigerator === '1') fasilitas.push(9);
                if (stove === '1') fasilitas.push(10);
                if (microwave === '1') fasilitas.push(11);
                if (oven === '1') fasilitas.push(12);
                if (fireExtinguisher === '1') fasilitas.push(13);
                if (gordyn === '1') fasilitas.push(14);
                const imageKeys = Object.keys(list).filter(item => item.startsWith('image'));
                imageKeys.forEach(image => {
                    if (list[image]) images.push(list[image]);
                })
                const data = {
                    ...list,
                    tipe: Number(tipe),
                    sertifikasi: Number(sertifikasi),
                    fasilitas,
                    images
                }
                const err = await publishToOlx(data);
                if (err) {
                    await page.close()
                    throw new Error("Wrong!")
                }
            } catch (e) {
                await setTimeout(async () => {
                    res.redirect('/');
                }, 5000)
            }
        }
        broadcast("Publish ads finish!")
    } catch (e) {
        res.redirect("/")
    }
}
const loginToOlx = async (data) => {
    if (!page) await createPuppeteerWindow()
    const {email, password} = data;
    try {
        broadcast("Open login page ..")
        await page.goto("https://www.olx.co.id/post")
    } catch (e) {
        broadcast("Error while open login page ..")
        return true
    }
    try {
        broadcast("Check if you're logged in ..")
        await page.waitForSelector("[data-aut-id=\"emailLogin\"]", {timeout: 5000})
    } catch (e) {
        loggedIn = true
        broadcast("You're logged in ..")
        return false
    }
    try {
        broadcast("Click login with email ..")
        await page.click('[data-aut-id="emailLogin"]')
    } catch (e) {
        broadcast("Error while click login with email ..")
        return true
    }
    try {
        broadcast("Entering email address ..")
        await page.type('#email_input_field', email + '\n')
    } catch (e) {
        broadcast("Error while entering email address ..")
        return true
    }
    try {
        broadcast("Entering password ..")
        await page.waitForSelector('#password')
        await page.type('#password', password + '\n')
    } catch (e) {
        broadcast("Error while entering password ..")
        return true
    }
    try {
        broadcast("Check if you're logged in ..")
        await page.waitForSelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)')
    } catch (e) {
        broadcast("Login error, check your account detail ..")
        return true
    }
    loggedIn = true
    console.log(loggedIn)
    broadcast("Login successfully!")
}
const publishToOlx = async (data) => {
    console.log(!page)
    if (!page) await createPuppeteerWindow()
    try {
        broadcast("Open login page ..")
        await page.goto("https://www.olx.co.id/post")
    } catch (e) {
        broadcast("Error while open login page ..")
        console.log(e)
        return true
    }
    try {
        broadcast('Chose a category, sub category and type ..')
        await page.waitForSelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)')
        await page.evaluate(`
        document.querySelector('ul[data-aut-id="categoryLevel"] > li:nth-child(2)').click();
        document.querySelector('ul[data-aut-id="subcategoryLevel"] > li:nth-child(1)').click();
        `)
    } catch (e) {
        broadcast("Error while chose a category, sub category and type ...")
        console.log(e)
        return true
    }
    try {
        broadcast('Chose type and certificate ..')
        await page.waitForSelector(`[data-aut-id="optype0"]`)
        await page.waitForSelector(`[data-aut-id="opp_certificate0"]`)
        await page.evaluate(`
        document.querySelector('[data-aut-id="optype${data.tipe - 1}"]').click();
        document.querySelector('[data-aut-id="opp_certificate${data.sertifikasi - 1}"]').click();
        `)
    } catch (e) {
        broadcast('Failed to chose type and certificate!')
        console.log(e)
        return true
    }
    try {
        broadcast('Uploading images ..')
        const imageUploadElement = await page.$('input[type="file"]')
        for (const image of data.images) {
            await imageUploadElement.uploadFile(image)
        }
    } catch (e) {
        broadcast('Failed to uploading images!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill building area ..')
        await page.type('#p_sqr_building', data.luasBangunan)
    } catch (e) {
        broadcast('Failed to Fill building area!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill surface area ..')
        await page.type('#p_sqr_land', data.luasTanah)
    } catch (e) {
        broadcast('Failed to Fill surface area!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill number of bedroom ..')
        await page.type('#p_bedroom', data.kamarTidur)
    } catch (e) {
        broadcast('Failed to Fill number of bedroom!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill number of bathroom ..')
        await page.type('#p_bathroom', data.kamarMandi)
    } catch (e) {
        broadcast('Failed to Fill number of bathroom!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill number of floor ..')
        await page.type('#p_floor', data.lantai)
    } catch (e) {
        broadcast('Failed to Fill number of floor!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill address ..')
        await page.type('#p_alamat', data.alamatLokasi)
    } catch (e) {
        broadcast('Failed to Fill address!')
        console.log(e)
        return true;
    }
    try {
        broadcast('Fill ad title ..')
        await page.type('#title', data.judulIklan)
    } catch (e) {
        broadcast('Failed to Fill ad title!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill description ..')
        await page.type('#description', data.deskripsi)
    } catch (e) {
        broadcast('Failed to Fill description!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill price ..')
        await page.type('#price', data.harga)
    } catch (e) {
        broadcast('Failed to Fill price!')
        console.log(e)
        return true
    }
    try {
        broadcast('Choose state ..')
        await page.type('#State', data.wilayah)
    } catch (e) {
        broadcast('Failed to Choose state!')
        console.log(e)
        return true
    }
    try {
        broadcast('Choose city ..')
        await page.waitForSelector('#City')
        await page.type('#City', data.kota)
    } catch (e) {
        broadcast('Failed to Choose city!')
        console.log(e)
        return true
    }
    try {
        broadcast('Choose locality ..')
        await page.waitForSelector('#Locality')
        await page.type('#Locality', data.kecamatan)
    } catch (e) {
        broadcast('Failed to Choose locality!')
        console.log(e)
        return true
    }
    try {
        broadcast('Fill facilities check ..')
        if (data.fasilitas.includes(1)) await page.click('#checkbox-ac')
        if (data.fasilitas.includes(2)) await page.click('#checkbox-swimmingpool')
        if (data.fasilitas.includes(3)) await page.click('#checkbox-carport')
        if (data.fasilitas.includes(4)) await page.click('#checkbox-garden')
        if (data.fasilitas.includes(5)) await page.click('#checkbox-garasi')
        if (data.fasilitas.includes(6)) await page.click('#checkbox-telephone')
        if (data.fasilitas.includes(7)) await page.click('#checkbox-pam')
        if (data.fasilitas.includes(8)) await page.click('#checkbox-waterheater')
        if (data.fasilitas.includes(9)) await page.click('#checkbox-refrigerator')
        if (data.fasilitas.includes(10)) await page.click('#checkbox-stove')
        if (data.fasilitas.includes(11)) await page.click('#checkbox-microwave')
        if (data.fasilitas.includes(12)) await page.click('#checkbox-oven')
        if (data.fasilitas.includes(13)) await page.click('#checkbox-fireextenguisher')
        if (data.fasilitas.includes(14)) await page.click('#checkbox-gordyn')
    } catch (e) {
        broadcast('Failed to Fill facilities check!')
        console.log(e)
        return true;
    }
    try {
        broadcast('Publish ad ..')
        await page.click('[data-aut-id="btnPost"]')
    } catch (e) {
        broadcast('Failed to Publish ad!')
        console.log(e)
        return true;
    }
    broadcast("Publish ad successfully!")
    try {
        broadcast('Delay after post ' + (data.delay ? data.delay / 1000 : 60) + ' seconds ..')
        await page.waitForTimeout(data.delay || 60000);
    } catch (e) {
        broadcast('Failed to delay after post!')
        console.log(e)
        return true;
    }
}
const logoutFromOlx = async () => {
    if (!page) await createPuppeteerWindow()
    loggedIn = false
    broadcast("Logout successfully!")
}

// electron event listener
electron.whenReady().then(createMainWindow)
electron.on("window-all-closed", () => {
    if (process.platform !== 'darwin') {
        electron.quit()
    }
})
electron.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow()
    }
})

// setup electron app menu
const menu = Menu.buildFromTemplate([
    {
        label: 'Home',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/`)
            }
            else await createWindow('/')
        }
    },
    {
        label: 'Login',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/login`)
            }
            else await createWindow('/login')
        }
    },
    {
        label: 'Register',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/register`)
            }
            else await createWindow('/register')
        }
    },
    {
        label: 'Docs',
        click: async () => {
            if (popup) {
                const page = (await browser.pages())[1]
                page.goto(`http://localhost:${APP_PORT || 8080}/docs`)
            }
            else await createWindow('/docs', 800, 600)
        }
    },
    {
        label: 'Help',
        click: async () => {
            const phone = '6288908883345';
            const text = 'Assalamualaikum saya mau tanya mengenai aplikasi electron puppeteer';
            await shell.openExternal(`https://web.whatsapp.com/send/?phone=${phone}&text=${text}`)
        }
    },
])
Menu.setApplicationMenu(menu)

// routing server
app.get("/login", getLoginResolver)
app.get("/register", getRegisterResolver)
app.get("/docs", getDocsResolver)
app.get("/logout", getLogoutResolver)
app.get("/", getHomeResolver)
app.post("/login", postLoginResolver)
app.post("/register", postRegisterResolver)
app.post("/remove", postRemoveResolver)
app.post("/", upload.single("file"), postHomeResolver)

// listen to port
server.listen(APP_PORT || '8080', () => console.log(`Server running in port ${APP_PORT || 8080}!
App URL => http://localhost:${APP_PORT || 8080}/`))
