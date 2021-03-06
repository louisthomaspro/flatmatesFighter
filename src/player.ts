import MultiKey from "./multi-key"
import Grab from "./grab"
import MainScene from "./main-scene"
import Gamepad from "./gamepad"

export default class Player {

  scene: MainScene
  direction: boolean // false=>left, true=>right
  sprite: Phaser.Physics.Matter.Sprite
  sensors: any // left,right,bottom sensors
  grab: Grab // grab sensor
  isTouching: { left: boolean, right: boolean, ground: boolean }
  canJump: boolean
  jumpCooldownTimer: any

  canDash: boolean
  isDashing: boolean
  velocityDashing: { x: number, y: number }

  dashCooldownTimer: any
  dashDurationTimer: any

  leftInput: MultiKey
  rightInput: MultiKey
  upInput: MultiKey
  downInput: MultiKey
  jumpInput: MultiKey
  grabInput: MultiKey
  dashInput: MultiKey

  destroyed: boolean
  unsubscribePlayerCollide: any

  gamepad: Gamepad

  life: integer = 3

  dead: boolean = false;



  constructor(scene: MainScene, x: number, y: number) {
    this.scene = scene

    this.direction = true // false: left right: true

    this.gamepad = new Gamepad()

    // Create the animations we need from the player spritesheet
    const anims = scene.anims
    anims.create({
      key: "player-idle",
      frames: anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 3,
      repeat: -1
    })
    anims.create({
      key: "player-run",
      frames: anims.generateFrameNumbers("player", { start: 8, end: 15 }),
      frameRate: 12,
      repeat: -1
    })


    // Create the physics-based sprite that we will move around and animate
    this.sprite = scene.matter.add.sprite(0, 0, "player", 0)

    // The player's body is going to be a compound body that looks something like this:
    //
    //                  A = main body
    //
    //                   +---------+
    //                   |         |
    //                 +-+         +-+
    //       B = left  | |         | |  C = right
    //    wall sensor  |B|    A    |C|  wall sensor
    //                 | |         | |
    //                 +-+         +-+
    //                   |         |
    //                   +-+-----+-+
    //                     |  D  |
    //                     +-----+
    //
    //                D = ground sensor
    //
    // The main body is what collides with the world. The sensors are used to determine if the
    // player is blocked by a wall or standing on the ground.

    // @ts-ignore: Property 'Matter' does not exist on type 'typeof Matter'.
    const { Bodies, Body, Constraint } = Phaser.Physics.Matter.Matter

    const { width: w, height: h } = this.sprite
    const mainBody = Bodies.rectangle(0, 0, 20, h, { chamfer: { radius: 10 } })


    this.sensors = {
      bottom: Bodies.rectangle(0, h * 0.5, w * 0.25, 2, { isSensor: true }),
      left: Bodies.rectangle(-w * 0.35, 0, 2, h * 0.5, { isSensor: true }),
      right: Bodies.rectangle(w * 0.35, 0, 2, h * 0.5, { isSensor: true })
    }
    const compoundBody = Body.create({
      parts: [mainBody, this.sensors.bottom, this.sensors.left, this.sensors.right],
      frictionStatic: 0,
      frictionAir: 0.02,
      friction: 0.1
    })

    this.canDash = true

    this.sprite.setExistingBody(compoundBody)
    this.sprite.setScale(2)
    this.sprite.setFixedRotation() // Sets inertia to infinity so the player can't rotate
    this.sprite.setPosition(x, y)

    this.grab = new Grab(this, scene)


    // Track which sensors are touching something
    this.isTouching = { left: false, right: false, ground: false }

    // Jumping is going to have a cooldown
    this.canJump = true
    this.jumpCooldownTimer = null

    // Before matter's update, reset our record of which surfaces the player is touching.
    scene.matter.world.on("beforeupdate", this.resetTouching, this)

    scene.matterCollision.addOnCollideStart({
      objectA: [this.sensors.bottom, this.sensors.left, this.sensors.right],
      callback: this.onSensorCollide,
      context: this
    })
    scene.matterCollision.addOnCollideActive({
      objectA: [this.sensors.bottom, this.sensors.left, this.sensors.right],
      callback: this.onSensorCollide,
      context: this
    })

    this.subscribePlayerCollide()

    const { LEFT, RIGHT, DOWN, UP, E, Z, A, CTRL } = Phaser.Input.Keyboard.KeyCodes

    // Track the keys
    this.leftInput = new MultiKey(scene, [LEFT])
    this.rightInput = new MultiKey(scene, [RIGHT])
    this.upInput = new MultiKey(scene, [UP])
    this.downInput = new MultiKey(scene, [DOWN])
    this.jumpInput = new MultiKey(scene, [UP, A])
    this.grabInput = new MultiKey(scene, [CTRL, E])
    this.dashInput = new MultiKey(scene, [Z])

    this.destroyed = false
    this.scene.events.on("update", this.update, this)
    this.scene.events.once("shutdown", this.destroy, this)
    this.scene.events.once("destroy", this.destroy, this)

  }

  subscribePlayerCollide() {
    this.unsubscribePlayerCollide = this.scene.matterCollision.addOnCollideStart({
      objectA: this.sprite,
      callback: this.onPlayerCollide,
      context: this
    })
  }


  onSensorCollide({ bodyA, bodyB, pair }: any) {
    // Watch for the player colliding with walls/objects on either side and the ground below, so
    // that we can use that logic inside of update to move the player.
    // Note: we are using the "pair.separation" here. That number tells us how much bodyA and bodyB
    // overlap. We want to teleport the sprite away from walls just enough so that the player won't
    // be able to press up against the wall and use friction to hang in midair. This formula leaves
    // 0.5px of overlap with the sensor so that the sensor will stay colliding on the next tick if
    // the player doesn't move.
    if (bodyB.isSensor) return // We only care about collisions with physical objects
    if (bodyA === this.sensors.left) {
      this.isTouching.left = true
      if (pair.separation > 0.5) this.sprite.x += pair.separation - 0.5
    } else if (bodyA === this.sensors.right) {
      this.isTouching.right = true
      if (pair.separation > 0.5) this.sprite.x -= pair.separation - 0.5
    } else if (bodyA === this.sensors.bottom) {
      this.isTouching.ground = true
    }
  }


  onPlayerCollide({ gameObjectB }: any) {
    if (!gameObjectB || !(gameObjectB instanceof Phaser.Tilemaps.Tile)) return
    const tile = gameObjectB

    // Check the tile property set in Tiled (you could also just check the index if you aren't using
    // Tiled in your game)
    if (tile.properties.isLethal) {
      // this.player1.freeze()
      // const cam = this.cameras.main
      // cam.fade(250, 0, 0, 0)
      // cam.once("camerafadeoutcomplete", () => this.scene.restart())
      this.kill()
    }
  }

  resetTouching() {
    this.isTouching.left = false
    this.isTouching.right = false
    this.isTouching.ground = false
  }

  freeze() {
    this.sprite.setStatic(true)
  }

  update() {
    if (this.destroyed) return
    if (this.sprite.y > this.scene.cameras.main.height) {
      this.kill()
    }


    // @ts-ignore
    const sprite = this.sprite
    const body = sprite.body as any
    const velocity = body.velocity

    const isRightKeyDown = this.rightInput.isDown() || this.gamepad.joystickRight()
    const isLeftKeyDown = this.leftInput.isDown() || this.gamepad.joystickLeft()
    const isJumpKeyDown = this.jumpInput.isDown() || this.gamepad.buttonA()
    const isUpKeyDown = this.upInput.isDown() || this.gamepad.buttonA()
    const isDownKeyDown = this.downInput.isDown() || this.gamepad.buttonA()
    const isGrabKeyDown = this.grabInput.isDown() || this.gamepad.buttonX()
    const isDashKeyDown = this.dashInput.isDown() || this.gamepad.buttonX()
    const isOnGround = this.isTouching.ground
    const isInAir = !isOnGround

    // --- Move the player horizontally ---

    // Adjust the movement so that the player is slower in the air
    const moveForce = isOnGround ? 0.01 : 0.005

    if (isLeftKeyDown) {
      sprite.setFlipX(true)

      // Don't let the player push things left if they in the air
      if (!(isInAir && this.isTouching.left)) {
        sprite.applyForce(new Phaser.Math.Vector2(-moveForce, 0))
        this.direction = false
      }
    } else if (isRightKeyDown) {
      sprite.setFlipX(false)

      // Don't let the player push things right if they in the air
      if (!(isInAir && this.isTouching.right)) {
        sprite.applyForce(new Phaser.Math.Vector2(moveForce, 0))
        this.direction = true
      }
    }
    

    // Limit horizontal speed, without this the player's velocity would just keep increasing to
    // absurd speeds. We don't want to touch the vertical velocity though, so that we don't
    // interfere with gravity.
    if (velocity.x > 7) sprite.setVelocityX(7)
    else if (velocity.x < -7) sprite.setVelocityX(-7)

    // --- Move the player vertically ---

    if (isJumpKeyDown && this.canJump && isOnGround) {
      sprite.setVelocityY(-11)

      // Add a slight delay between jumps since the bottom sensor will still collide for a few
      // frames after a jump is initiated
      this.canJump = false
      this.jumpCooldownTimer = this.scene.time.addEvent({
        delay: 250,
        callback: () => (this.canJump = true)
      })
    }

    // Update the animation/texture based on the state of the player's state
    if (isOnGround) {
      if (body.force.x !== 0) sprite.anims.play("player-run", true)
      else sprite.anims.play("player-idle", true)
    } else {
      sprite.anims.stop()
      sprite.setTexture("player", 10)
    }



    if (isDashKeyDown && this.canDash) {

      this.canDash = false
      this.isDashing = true

      const force = 20

      let xVelocity = 0
      let yVelocity = 0

      if (isRightKeyDown) xVelocity = force
      if (isLeftKeyDown) xVelocity = -force
      if (isUpKeyDown) yVelocity = -force
      if (isDownKeyDown) yVelocity = force

      this.velocityDashing = { x: xVelocity, y: yVelocity }


      this.dashDurationTimer = this.scene.time.addEvent({
        delay: 200,
        callback: () => {
          this.isDashing = false
        }
      })

      this.dashCooldownTimer = this.scene.time.addEvent({
        delay: 1000,
        callback: () => (this.canDash = true)
      })

    }

    if (this.isDashing) {
      sprite.setVelocity(this.velocityDashing.x, this.velocityDashing.y)
    }


    this.grab.updateBodyDirection(this.direction)
    this.grab.grabbingAction(isGrabKeyDown)

    // this.pear.updateBodyDirection(this.direction)
  }

  destroy() {
    // Clean up any listeners that might trigger events after the player is officially destroyed
    this.scene.events.off("update", this.update, this)
    this.scene.events.off("shutdown", this.destroy, this)
    this.scene.events.off("destroy", this.destroy, this)
    if (this.scene.matter.world) {
      this.scene.matter.world.off("beforeupdate", this.resetTouching, this)
    }
    const sensors = [this.sensors.bottom, this.sensors.left, this.sensors.right]
    this.scene.matterCollision.removeOnCollideStart({ objectA: sensors })
    this.scene.matterCollision.removeOnCollideActive({ objectA: sensors })
    if (this.jumpCooldownTimer) this.jumpCooldownTimer.destroy()

    this.grab.destroy()

    this.destroyed = true
    this.sprite.destroy()
  }

  kill() {
    if (this.dead) return;
    console.log("RIP")
    this.grab.bodyCaught = null
    this.life--
    this.dead = true;
    this.scene.time.addEvent({
      delay: 1000,
      callback: () => {
        this.resurrect()
      }
    })
  }

  resurrect() {
    console.log("resurect")
    this.sprite.setPosition(this.scene.x_default, this.scene.y_default)
    this.sprite.setVelocity(0, 0)
    this.subscribePlayerCollide()
    this.dead = false;
  }
}
