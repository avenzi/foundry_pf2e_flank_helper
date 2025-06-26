const MODULE_NAME = "flank-helper"

// TODO how to perform an update when a user activates Lunge or a spell effect?
//  Tried hooks: updateActor, applyTokenStatusEffect, applyActiveEffect, modifyTokenAttribute
//  Found that dropActorSheetData will trigger when a potion effect is dragged onto a token,
//   but not when it's deleted or if done from a different character's sheet
//  Was able to detect Lunge change when toggling the checkbox, but this doesn't update it for other people.



Hooks.on("init", init_settings)
Hooks.on("ready", function() {
    debug("Creating FlankHelper for all tokens...")
    init_auto_refresh()  // start the auto-refresh loop

    // Detect when attack options are toggled (like Lunge)
    $(document).on("click", "div.actions-container input", () => update_all(50))
});
Hooks.on("canvasReady", function () {
    // This is triggered on start and when the scene changes
    log("Canvas Ready. Creating FlankHelper for all tokens...")
    update_all()
})
Hooks.on("createToken", (document, options, userID) => {
    // When a new token is created, add a FlankHelper to it and update all others
    debug("New token: "+ document.name)
    update_all()
})
Hooks.on("preDeleteToken", (document, options, userID) => {
    // Before a token is deleted, clear its flank helper graphics
    debug("About to delete token: "+document.name)
    document.object.flank_helper.clear()
})
Hooks.on("deleteToken", (document, options, userID) => {
    // After a token is deleted, update all other tokens FlankHelpers
    debug("Deleted token: "+document.name)
    update_all()
})
Hooks.on("updateToken", (document, options, userID) => {
    // triggered when a token is hidden/unhidden, and when a token starts moving
    debug("Token Updated: "+document.name)
    update_all()
})
Hooks.on("moveToken", (document, movement, operation, user) => {
    // When a token moves, all other tokens need to update their indicators
    // This is also triggered when a token changes size, which is useful.
    let {x, y} = movement.destination

    // for some reason the "stopToken" hook doesn't work, so I gotta do this stupid callback to constantly check if it's finished
    let id = setInterval(() => {
        let pos = document.object.position
        if (pos.x === x && pos.y === y) {
            debug("Token stopped moving: "+document.name)
            clearInterval(id);
            update_all()
        }
    }, 300);  // 200 was a bit too fast for some updates, 300 seems good for most things
})
Hooks.on("renderTokenHUD", (_app, html, data) => {
    // When a token is right-clicked, showing the HUD
    if (!canvas || !canvas.tokens) return;
    let token = canvas.tokens.get(data._id) ?? null;
    if (!token) {
        error("No token identified on renderTokenHud Hook")
        return
    }
    token.flank_helper?.render_hud(html)
});

// Hooks.on("updateActor", function (document, changed, options, userID) {console.log("UPDATED:", document, changed, options, userID)})
// Hooks.on("applyTokenStatusEffect", function (token, status, active) {console.log("EFFECT: ", token, status, active)})
// Hooks.on("modifyTokenAttribute", function (data, updates, actor) {console.log("MODIFY: ", data, updates, actor)})
// Hooks.on("applyActiveEffect", function (actor, change, current, delta, changes) {console.log("ACTIVE: ", actor, changes, current, delta, changes)})
// Hooks.on("stopToken", function () {console.log("WHY DOESNT THIS WORK")})
Hooks.on("dropActorSheetData", function (actor, sheet, data) {
    // This hook is called when an effect is dragged onto a token
    debug("Sheet Update: ", actor, sheet, data)
    setTimeout(() => {
        update_token(sheet?.token?.object)
    }, 200);
})


// Utilities
function log(message) {
    console.log("[Flank Helper]:", message)
}
function debug(message) {
    if (get_settings('debug')) {
        console.log("[Flank Helper][DEBUG]:", message)
    }
}
function error(message) {
    console.error("[Flank Helper]:", message)
}
function get_settings(key) {
    return game.settings.get(MODULE_NAME, key)
}
function set_setting(key, value) {
    game.settings.set(MODULE_NAME, key, value)
}



function update_all(delay=0) {
    // Update all currently controlled tokens after a delay
    if (delay === 0) {
        for (let token of canvas.tokens.placeables) {
            update_token(token)
        }
    } else {
        setTimeout(() => {
            for (let token of canvas.tokens.placeables) {
                update_token(token)
            }
        }, delay);
    }
}
function update_token(token) {
    // Update the FlankHelper for a given token, initializing it if needed
    if (!token) return
    if (!token.flank_helper) {
        token.flank_helper = new FlankHelper(token)
    }
    token.flank_helper.update_all()
}


function init_settings() {
    game.settings.register(MODULE_NAME, 'auto-refresh-indicators', {
        name: `${MODULE_NAME}.Settings.auto-refresh-indicators.name`,
        hint: `${MODULE_NAME}.Settings.auto-refresh-indicators.hint`,
        scope: 'client',
        config: true,
        default: 5,
        type: Number,
        onChange: init_auto_refresh
    })
    game.settings.register(MODULE_NAME, 'self-conditions-prevent-flanking', {
        name: `${MODULE_NAME}.Settings.self-conditions-prevent-flanking.name`,
        hint: `${MODULE_NAME}.Settings.self-conditions-prevent-flanking.hint`,
        scope: 'client',
        config: true,
        default: false,
        type: Boolean,
        onChange: update_all
    })
    game.settings.register(MODULE_NAME, 'others-conditions-prevent-flanking', {
        name: `${MODULE_NAME}.Settings.others-conditions-prevent-flanking.name`,
        hint: `${MODULE_NAME}.Settings.others-conditions-prevent-flanking.hint`,
        scope: 'client',
        config: true,
        default: false,
        type: Boolean,
        onChange: update_all
    })
    game.settings.register(MODULE_NAME, 'debug', {
        name: `${MODULE_NAME}.Settings.debug.name`,
        hint: `${MODULE_NAME}.Settings.debug.hint`,
        scope: 'client',
        config: true,
        default: false,
        type: Boolean,
        onChange: update_all
    })
}

var cancel_auto_refresh = null;
function init_auto_refresh() {
    // Update all flank helpers every number of seconds, according to settings.
    // Call again to cancel and restart
    let interval = get_settings('auto-refresh-indicators')
    if (cancel_auto_refresh) {
        clearInterval(cancel_auto_refresh);
    }
    if (interval <= 0) return;  // disabled
    cancel_auto_refresh = setInterval(() => {
        update_all()
    }, interval * 1000);

}

/**
 * Handler class that attaches to all tokens in the scene.
 * "Token Square" will refer to the square grid coordinates of the top-left most square of a token.
 */
class FlankHelper {
    token;
    enabled = false;
    thickness = CONFIG.Canvas.objectBorderThickness;
    _layer;

    potential_flanked_color = CONFIG.Canvas.dispositionColors.CONTROLLED;
    flanked_color = CONFIG.Canvas.dispositionColors.FRIENDLY
    // CONTROLLED FRIENDLY HOSTILE INACTIVE NEUTRAL PARTY SECRET

    constructor(token) {
        this.token = token
    }

    get icon_title() {
        return this.enabled ? "Hide Flank Helper" : "Show Flank Helper";
    }
    get icon_class() {
        return this.enabled ? "fa-solid fa-users" : "fa-solid fa-users";
    }
    get layer() {
        // Get existing graphics layer or create a new one
        if (!this._layer) {
            this._layer = new PIXI.Graphics();
            this.token.layer.addChild(this._layer);
        }
        return this._layer
    }

    clear() {
        // Destroy the current graphics layer
        this._layer?.destroy({ children: true });
        this._layer = null;
    }
    render_hud(html) {
        // Callback for rendering the token HUD
        let $toggle = $(`<button type="button" class="control-icon toggle ${this.enabled ? "active" : ""}" data-tooltip="${this.icon_title}"></button>`)
        let $icon = $(`<i class="${this.icon_class}"/>`).appendTo($toggle)

        // button callback
        $toggle.on('click', async (e) => {
            if (this.token === null) return
            let value = !this.enabled

            this.toggle(value);
            $icon[0].className = this.icon_class
            $toggle.attr('data-tooltip', this.icon_title)
            if (value) $toggle.addClass("active");
            else $toggle.removeClass("active");

        });

        // append button to left column
        const $column = $("div.col.left");
        if ($column) {
            $column.append($toggle);
        }
    }
    toggle(value) {
        this.enabled = value
        this.update_all()
    }

    update_all() {
        this.clear()  // clear existing graphics
        if (!this.enabled) return

        // Ignore if token is hidden and you are not GM
        if (this.token.document.hidden && !game.users.current.isGM) return

        // if we are accounting for self conditions, check if can flank
        if (get_settings("self-conditions-prevent-flanking")) {
            if (!this.can_flank(this.token)) return
        }

        // !!(((this.token.controlled) && !(this.token.isPreview || this.token.isAnimating));

        // Update the indicators for all allied tokens
        for (let token of canvas.tokens.placeables) {
            try {
                if (this.token === token) continue  // ignore self
                if (this.is_ally(this.token, token)) this.update(token)
            } catch (err) {
                log(err)
            }
        }
    }
    update(target_token) {
        // Draw the flank helpers for the given allied token
        if (!this.enabled) return

        // Ignore if token is hidden and you are not GM
        if (target_token.document.hidden && !game.users.current.isGM) return

        // if we are accounting for others' conditions, check if can flank
        if (get_settings("others-conditions-prevent-flanking")) {
            if (!this.can_flank(target_token)) return
        }

        // Get all enemy tokens in reach
        let enemies = []
        for (let token of canvas.tokens.placeables) {
            if (this.is_ally(this.token, token)) continue
            if (token.document.hidden && !game.users.current.isGM) continue // Token is hidden and you ar enot GM
            if (this.in_reach(target_token, token)) enemies.push(token)
        }

        // For each enemy, get all available squares within the current token's reach
        let valid_positions = new Set()  // set to remove redundant valid squares
        for (let enemy of enemies) {
            let squares = this.get_positions_in_reach(this.token, enemy)  // get valid token positions (grid squares)
            for (let square of squares) {
                valid_positions.add(square)
            }
        }

        // for each valid square, show any flanked enemies
        for (let square of valid_positions) {
            this.show_flanked_tokens(enemies, this.token, target_token, square)
        }
    }

    square_to_pixel(pos, center=true) {
        // convert a square grid position to a canvas pixel position
        let size = canvas.grid.size;
        let result = {x: pos.x*size, y: pos.y*size}
        if (center) {
            result.x += size/2
            result.y += size/2
        }
        return result
    }
    draw_dot(pos, color) {
        // Draw a dot at the position
        pos = this.square_to_pixel(pos)
        this.layer.beginFill(color).lineStyle(1, 0x000000).drawCircle(pos.x, pos.y, this.thickness*2);
    }
    draw_line(pos_a, pos_b, color) {
        pos_a = this.square_to_pixel(pos_a)
        pos_b = this.square_to_pixel(pos_b)
        this.layer.lineStyle(this.thickness, color, 0.5).moveTo(pos_a.x, pos_a.y).lineTo(pos_b.x, pos_b.y);
    }
    draw_square(token, color) {
        // draw a square around the given token
        let start = this.get_token_square(token)
        start = this.square_to_pixel(start, false)
        let {bounds} = token
        this.layer.beginFill(0x000000, 0).lineStyle(this.thickness*2, color, 0.5).drawRect(start.x, start.y, bounds.width, bounds.height)

    }

    get_min_square(squares) {
        // of the given squares, return the min-most square
        let x_min; let y_min;
        for (let s of squares) {
            if (x_min === undefined || s.x < x_min) x_min = s.x;
            if (y_min === undefined || s.y < y_min) y_min = s.y;
        }

        if (x_min !== squares[0].x || y_min !== squares[0].y) {
            error("MIN SQUARE WAS NOT THE FIRST")
            console.log(x_min, y_min)
            console.log(squares)
        }

        return {x: x_min, y: y_min}
    }
    get_token_square(token) {
        // Returns a single square that represents the token's position.
        // When the token covers multiple, this is the top-left most square (min x and min y)
        // TODO is the order guaranteed? If so we can just always grab the first one
        let token_squares = this.get_squares(token)
        if (token_squares.length === 1) return token_squares[0]
        return this.get_min_square(token_squares)
    }
    get_squares(token, square=null) {
        // Get the squares occupied by the given token.
        // Optionally provide a different square for the token's position

        // list of {i, j}. Convert j->x , i->y
        let occupies = token.document.getOccupiedGridSpaceOffsets()
        let squares = []
        for (let s of occupies) {
            squares.push({x: s.j, y: s.i})
        }

        // reference square is top-left most square of the token
        let ref = this.get_min_square(squares)

        let offset = {x:0,y:0}
        if (square !== null) {
            offset = {x: square.x-ref.x, y: square.y-ref.y}
        }

        let result = []
        for (let s of squares) {
            result.push({x: s.x+offset.x, y: s.y+offset.y})
        }
        return result
    }
    get_token_center(token, square=null) {
        // Calculate the center point of the token
        let squares = this.get_squares(token, square)
        let x = 0;
        let y = 0;
        for (let s of squares) {
            x += s.x
            y += s.y
        }
        x /= squares.length
        y /= squares.length
        return {x: x, y: y}
    }
    get_token_reach(token) {
        let actor = token?.document?.actor;
        if (!actor) {
            error(`No actor found for token: ${token?.name || "Unknown"}`);
            log(token)
            return 5; // Default melee reach for unknown cases.
        }
        return actor.getReach({ action: "attack" })
    }
    can_place(token, square) {
        // check if the token can be placed at the given grid square (i.e. not overlapping others)
        // yes this is inefficient but I am tired and it's like fine ok
        let occupies = this.get_squares(token, square)
        let all_tokens = canvas.tokens.placeables
        for (let other of all_tokens) {
            if (other === token) continue
            let other_occupies = this.get_squares(other)
            for (let square_a of occupies) {
                for (let square_b of other_occupies) {
                    if (square_a.x === square_b.x && square_a.y === square_b.y) return false  // overlap found
                }
            }
        }
        return true
    }
    in_reach(token_a, token_b, token_a_square=null) {
        // can token A can reach token B
        // Optional square for token_a
        let b_occupies = this.get_squares(token_b)
        let a_reaches = this.get_squares_in_reach(token_a, token_a_square)
        for (let square of a_reaches) {
            for (let b_square of b_occupies) {
                if (square.x === b_square.x && square.y === b_square.y) {
                    return true  // token_a reach overlaps any token_b occupied square
                }
            }
        }
        return false
    }
    get_squares_in_reach(token, square=null) {
        // Get all squares within reach of the token
        // Optionally provide a different position than the token
        let reach = this.get_token_reach(token) / 5
        let token_squares = this.get_squares(token, square)

        // get square bounds of the token
        let x_min; let x_max; let y_min; let y_max;
        for (let s of token_squares) {
            if (x_min === undefined || s.x < x_min) x_min = s.x;
            if (x_max === undefined || s.x > x_max) x_max = s.x;
            if (y_min === undefined || s.y < y_min) y_min = s.y;
            if (y_max === undefined || s.y > y_max) y_max = s.y;
        }

        // if custom position square given, shift all squares by the difference using the min-most square as a reference
        if (square !== null) {
            let diff_x = square.x-x_min
            let diff_y = square.y-y_min
            x_min += diff_x
            y_min += diff_y
            x_max += diff_x
            y_max += diff_y
        }

        // iterate through all squares within reach of each of the token's squares
        let squares = []
        for (let x = x_min-reach; x <= x_max+reach; x++) {
            for (let y = y_min-reach; y <= y_max+reach; y++) {
                squares.push({x: x, y: y})
            }
        }
        return squares
    }
    is_ally(token_a, token_b) {
        // Check if these tokens are considered allies.
        return token_a.actor?.alliance === token_b.actor?.alliance;
    }
    can_flank(token) {
        // Whether a token can flank (i.e. doesn't have a condition that prevents flanking)
        if (!token.actor?.system.attributes.flanking.canFlank) return false
        if (!token.actor?.canAttack) return false  // can't attack
        return true
    }
    can_be_flanked(token) {
        // Whether a token can be flanked

        // whether the token can be flanked, according to foundry (doesn't account for everything)
        //if (!token.actor?.system.attributes.flanking.flankable) return false

        return true
    }

    get_positions_in_reach(token, enemy) {
        // Find the possible locations that a token can be such that it can reach an enemy token
        // We do this by iterating through a spiralling pattern of squares and testing whether the token can be placed there, and still be in reach.
        // The result is a list of CENTER locations, which would be the center of the token if placed there.
        let result = []

        // up, right, down, left
        let directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]


        // Iterate through spiral pattern of squares around the enemy
        let layer = 1
        let index = 0  // counts up to the layer before turning
        let direction = 0  // 0 to 3
        let square = this.get_token_square(enemy)  // current square (start at enemy token square)
        let out_of_reach_counter = 0  // once we have been out of reach for 4 loops, end
        while (out_of_reach_counter < 4) {
            if (this.in_reach(token, enemy, square)) {  // can the token reach the enemy at this square
                out_of_reach_counter = 0  // reset
                if (this.can_place(token, square)) {  // can the token be placed at this square
                    result.push(structuredClone(square))  // this square is a valid location
                    if (get_settings('debug')) this.draw_dot(square, CONFIG.Canvas.dispositionColors.PARTY)
                }
            } else {
                out_of_reach_counter += 1/layer
            }

            square.x += directions[direction][0]
            square.y += directions[direction][1]
            index += 1

            if (index >= layer) {
                direction = (direction + 1) % 4
                index = 0  // reset index
                if (direction % 2 === 0) {  // increase layer at opposite corners
                    layer += 1
                }
            }
        }

        return result
    }
    show_flanked_tokens(flankable_tokens, token_a, token_b, token_a_square=null, token_b_square=null) {
        // for each flankable token, check if it is flanked by token_a and token_b, with optional positions
        // Only show the line if at least one enemy is flanked
        let color = this.potential_flanked_color

        if (token_a_square === null) token_a_square = this.get_token_square(token_a)
        if (token_b_square === null) token_b_square = this.get_token_square(token_b)
        let token_a_center = this.get_token_center(token_a, token_a_square)
        let token_b_center = this.get_token_center(token_b, token_b_square)

        // Check if we are currently at one of the locations being checked (use different color if so)
        let self = this.get_token_center(this.token)
        let self_show = false
        if ((self.x === token_a_center.x && self.y === token_a_center.y) || (self.x === token_b_center.x && self.y === token_b_center.y)) {
            color = this.flanked_color
            self_show = true
        }

        let show = false
        for (let flankee of flankable_tokens) {
            if (this.is_flanking(flankee, token_a, token_b, token_a_square, token_b_square)) {
                show = true
                if (self_show) {
                    this.draw_square(flankee, color)
                }
            }
        }

        if (show) {
            // display a line between these two grid positions and indicate any tokens flanked by them
            this.draw_line(token_a_center, token_b_center, color)

            // Draw circles at each end
            this.draw_dot(token_a_center, color)
            this.draw_dot(token_b_center, color)
        }
    }
    is_flanking(flankee, token_a, token_b, token_a_square=null, token_b_square=null) {
        // Whether the flankee is flanked by token_a and token_b, with optionally specified positions
        if (token_a_square === null) token_a_square = this.get_token_square(token_a)
        if (token_b_square === null) token_b_square = this.get_token_square(token_b)

        // Centers in pixel coords for raycasts
        let token_b_center = this.get_token_center(token_b, token_b_square)
        let token_a_center = this.get_token_center(token_a, token_a_square)
        token_a_center = this.square_to_pixel(token_a_center)
        token_b_center = this.square_to_pixel(token_b_center)

        const intersects = (side) => foundry.utils.lineSegmentIntersects(token_a_center, token_b_center, side.A || side.a, side.B || side.b);

        // check for edges. Search only within a rect between the two tokens.
        let min_x = Math.min(token_a_center.x, token_b_center.x)
        let min_y = Math.min(token_a_center.y, token_b_center.y)
        let width = Math.abs(token_a_center.x-token_b_center.x)
        let height = Math.abs(token_a_center.y-token_b_center.y)
        let rect = new PIXI.Rectangle(min_x, min_y, width, height)
        let edges = canvas.edges.getEdges(rect)
        for (let edge of edges) {
            if (intersects(edge)) {
                if (get_settings('debug')) this.layer.lineStyle(this.thickness, CONFIG.Canvas.dispositionColors.HOSTILE, 0.5).moveTo(edge.a.x, edge.a.y).lineTo(edge.b.x, edge.b.y);
                return false
            }
        }

        // check reach
        if (!this.in_reach(token_a, flankee, token_a_square)) return false
        if (!this.in_reach(token_b, flankee, token_b_square)) return false

        const { bounds } = flankee;
        const Ray = foundry.canvas.geometry.Ray;
        const left = new Ray({ x: bounds.left, y: bounds.top }, { x: bounds.left, y: bounds.bottom });
        const right = new Ray({ x: bounds.right, y: bounds.top }, { x: bounds.right, y: bounds.bottom });
        const top = new Ray({ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top });
        const bottom = new Ray({ x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom });

        return (intersects(left) && intersects(right)) || (intersects(top) && intersects(bottom));
    }
}
